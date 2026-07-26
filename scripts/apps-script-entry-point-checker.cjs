'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const defaultPolicyPath = path.join(root, 'config/apps-script-entry-points.json');

function readPolicy(policyPath = defaultPolicyPath) {
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

const policy = readPolicy();

function maskNonCode(source) {
  const chars = [...String(source)];
  const output = chars.slice();
  let state = 'code';
  let escaped = false;

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const next = chars[index + 1] || '';

    if (state === 'line-comment') {
      if (char === '\n') state = 'code';
      else output[index] = ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        output[index] = ' ';
        output[index + 1] = ' ';
        index += 1;
        state = 'code';
      } else if (char !== '\n') output[index] = ' ';
      continue;
    }
    if (state !== 'code') {
      if (escaped) {
        escaped = false;
        if (char !== '\n') output[index] = ' ';
        continue;
      }
      if (char === '\\') {
        escaped = true;
        output[index] = ' ';
        continue;
      }
      const terminator = state === 'single' ? "'" : state === 'double' ? '"' : '`';
      if (char === terminator) state = 'code';
      if (char !== '\n') output[index] = ' ';
      continue;
    }

    if (char === '/' && next === '/') {
      output[index] = ' ';
      output[index + 1] = ' ';
      index += 1;
      state = 'line-comment';
    } else if (char === '/' && next === '*') {
      output[index] = ' ';
      output[index + 1] = ' ';
      index += 1;
      state = 'block-comment';
    } else if (char === "'") {
      output[index] = ' ';
      state = 'single';
    } else if (char === '"') {
      output[index] = ' ';
      state = 'double';
    } else if (char === '`') {
      output[index] = ' ';
      state = 'template';
    }
  }
  return output.join('');
}

function discoverDeclarations(source, filePath, project = 'unknown') {
  const masked = maskNonCode(source);
  const declarations = [];
  const pattern = /(^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  let scanOffset = 0;
  let braceDepth = 0;

  while ((match = pattern.exec(masked))) {
    while (scanOffset < match.index) {
      if (masked[scanOffset] === '{') braceDepth += 1;
      if (masked[scanOffset] === '}') braceDepth = Math.max(0, braceDepth - 1);
      scanOffset += 1;
    }
    if (braceDepth !== 0) continue;
    const offset = match.index + match[1].length;
    declarations.push({
      symbol: match[2],
      project,
      file: filePath,
      line: masked.slice(0, offset).split('\n').length
    });
  }
  return declarations;
}

function classifySymbol(symbol, configuredPolicy = policy) {
  if (configuredPolicy.explicitClassifications[symbol]) return configuredPolicy.explicitClassifications[symbol];
  for (const rule of configuredPolicy.classificationRules) {
    if (new RegExp(rule.pattern).test(symbol)) return rule.classification;
  }
  return 'manual_review';
}

function listSourceFiles(directory, recursive, excluded) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory() && recursive) output.push(...listSourceFiles(full, true, excluded));
    else if (entry.isFile() && /\.(gs|html)$/.test(entry.name)) output.push(full);
  }
  return output;
}

function buildInventory(repositoryRoot = root, configuredPolicy = policy) {
  const excluded = new Set(configuredPolicy.excludedDirectories || []);
  const declarations = [];

  for (const project of configuredPolicy.projects || []) {
    const projectRoot = path.resolve(repositoryRoot, project.root);
    for (const file of listSourceFiles(projectRoot, project.recursive !== false, excluded)) {
      const relative = path.relative(repositoryRoot, file).split(path.sep).join('/');
      declarations.push(...discoverDeclarations(fs.readFileSync(file, 'utf8'), relative, project.name));
    }
  }

  const byProjectAndSymbol = new Map();
  for (const declaration of declarations) {
    const key = `${declaration.project}:${declaration.symbol}`;
    if (!byProjectAndSymbol.has(key)) byProjectAndSymbol.set(key, []);
    byProjectAndSymbol.get(key).push(declaration);
  }

  return [...byProjectAndSymbol.entries()].map(([key, locations]) => {
    const [project, ...symbolParts] = key.split(':');
    const symbol = symbolParts.join(':');
    return {
      project,
      symbol,
      classification: classifySymbol(symbol, configuredPolicy),
      declarations: locations,
      duplicate: locations.length > 1,
      temporaryDuplicateException: configuredPolicy.temporaryDuplicateExceptions[key] || ''
    };
  }).sort((a, b) => `${a.project}:${a.symbol}`.localeCompare(`${b.project}:${b.symbol}`));
}

function evaluateInventory(inventory) {
  const errors = [];
  for (const item of inventory) {
    const qualified = `${item.project}:${item.symbol}`;
    if (!item.classification) errors.push(`${qualified}: unclassified`);
    if (item.duplicate && !item.temporaryDuplicateException) {
      errors.push(`${qualified}: duplicate declarations at ${item.declarations.map((declaration) => `${declaration.file}:${declaration.line}`).join(', ')}`);
    }
  }
  return errors;
}

function parseCliArgs(args) {
  let writeInventory = true;
  for (const argument of args) {
    if (argument === '--no-write') {
      writeInventory = false;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return { writeInventory };
}

function resolveCliPaths(environment = process.env) {
  const repositoryRoot = path.resolve(environment.DMSC_ENTRY_POINT_CHECKER_ROOT || root);
  const policyPath = path.resolve(
    environment.DMSC_ENTRY_POINT_CHECKER_POLICY || path.join(repositoryRoot, 'config/apps-script-entry-points.json')
  );
  return { repositoryRoot, policyPath };
}

function runCli(args = process.argv.slice(2), io = console, environment = process.env) {
  let cliOptions;
  try {
    cliOptions = parseCliArgs(args);
  } catch (error) {
    io.error(error.message);
    return 2;
  }

  try {
    const { repositoryRoot, policyPath } = resolveCliPaths(environment);
    const configuredPolicy = readPolicy(policyPath);
    const inventory = buildInventory(repositoryRoot, configuredPolicy);
    const errors = evaluateInventory(inventory);

    if (cliOptions.writeInventory) {
      const outputPath = path.join(repositoryRoot, 'docs/apps-script-entry-point-inventory.json');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), inventory }, null, 2)}\n`);
    }

    io.log(`Classified ${inventory.length} deployable symbols across ${(configuredPolicy.projects || []).length} Apps Script projects.`);
    if (errors.length) {
      io.error(errors.join('\n'));
      return 1;
    }
    return 0;
  } catch (error) {
    io.error(`Entry-point checker failed: ${error.message}`);
    return 2;
  }
}

module.exports = {
  root,
  policy,
  discoverDeclarations,
  classifySymbol,
  buildInventory,
  evaluateInventory,
  runCli
};

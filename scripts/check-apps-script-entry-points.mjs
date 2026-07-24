#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config/apps-script-entry-points.json'), 'utf8'));

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

export function discoverDeclarations(source, filePath, project = 'unknown') {
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

export function classifySymbol(symbol, configuredPolicy = policy) {
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

export function buildInventory(repositoryRoot = root, configuredPolicy = policy) {
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

export function evaluateInventory(inventory) {
  const errors = [];
  for (const item of inventory) {
    const qualified = `${item.project}:${item.symbol}`;
    if (!item.classification) errors.push(`${qualified}: unclassified`);
    if (item.duplicate && !item.temporaryDuplicateException) {
      errors.push(`${qualified}: duplicate declarations at ${item.declarations.map((d) => `${d.file}:${d.line}`).join(', ')}`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inventory = buildInventory();
  const errors = evaluateInventory(inventory);
  const outputPath = path.join(root, 'docs/apps-script-entry-point-inventory.json');
  fs.writeFileSync(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), inventory }, null, 2)}\n`);
  console.log(`Classified ${inventory.length} deployable symbols across ${policy.projects.length} Apps Script projects.`);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
}

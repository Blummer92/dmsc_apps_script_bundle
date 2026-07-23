#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'config/apps-script-entry-points.json'), 'utf8'));

export function discoverDeclarations(source, filePath) {
  const declarations = [];
  const pattern = /(^|\n)\s*function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = pattern.exec(source))) {
    const offset = match.index + match[1].length;
    const line = source.slice(0, offset).split('\n').length;
    declarations.push({ symbol: match[2], file: filePath, line });
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

function walk(directory, excluded, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, excluded, output);
    else if (entry.isFile() && /\.(gs|html)$/.test(entry.name)) output.push(full);
  }
  return output;
}

export function buildInventory(repositoryRoot = root, configuredPolicy = policy) {
  const excluded = new Set(configuredPolicy.excludedDirectories || []);
  const declarations = walk(repositoryRoot, excluded).flatMap((file) => {
    const relative = path.relative(repositoryRoot, file).split(path.sep).join('/');
    return discoverDeclarations(fs.readFileSync(file, 'utf8'), relative);
  });
  const bySymbol = new Map();
  for (const declaration of declarations) {
    if (!bySymbol.has(declaration.symbol)) bySymbol.set(declaration.symbol, []);
    bySymbol.get(declaration.symbol).push(declaration);
  }
  return [...bySymbol.entries()].map(([symbol, locations]) => ({
    symbol,
    classification: classifySymbol(symbol, configuredPolicy),
    declarations: locations,
    duplicate: locations.length > 1,
    temporaryDuplicateException: configuredPolicy.temporaryDuplicateExceptions[symbol] || ''
  })).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

export function evaluateInventory(inventory) {
  const errors = [];
  for (const item of inventory) {
    if (!item.classification) errors.push(`${item.symbol}: unclassified`);
    if (item.duplicate && !item.temporaryDuplicateException) {
      errors.push(`${item.symbol}: duplicate declarations at ${item.declarations.map((d) => `${d.file}:${d.line}`).join(', ')}`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inventory = buildInventory();
  const errors = evaluateInventory(inventory);
  const outputPath = path.join(root, 'docs/apps-script-entry-point-inventory.json');
  fs.writeFileSync(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), inventory }, null, 2)}\n`);
  console.log(`Classified ${inventory.length} deployable symbols.`);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import checker from './apps-script-entry-point-checker.cjs';

const {
  root,
  policy,
  discoverDeclarations,
  classifySymbol,
  buildInventory,
  evaluateInventory
} = checker;

export {
  discoverDeclarations,
  classifySymbol,
  buildInventory,
  evaluateInventory
};

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

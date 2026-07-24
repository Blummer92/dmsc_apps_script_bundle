#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import callerChecker from './apps-script-entry-point-callers.cjs';
import { buildInventory } from './check-apps-script-entry-points.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entryPolicyPath = path.join(root, 'config/apps-script-entry-points.json');
const callerPolicyPath = path.join(root, 'config/apps-script-entry-point-callers.json');
const outputPath = path.join(root, 'docs/apps-script-entry-point-callers.json');

const entryPolicy = JSON.parse(fs.readFileSync(entryPolicyPath, 'utf8'));
const callerPolicy = JSON.parse(fs.readFileSync(callerPolicyPath, 'utf8'));
const inventory = buildInventory(root, entryPolicy);
const report = callerChecker.buildCallerReport(root, entryPolicy, callerPolicy, inventory);

const writeRequested = process.argv.includes('--write');
const noWriteRequested = process.argv.includes('--no-write');
if (writeRequested && noWriteRequested) {
  console.error('Choose either --write or --no-write, not both.');
  process.exit(2);
}

const callersByType = report.callers.reduce((counts, item) => {
  counts[item.callerType] = (counts[item.callerType] || 0) + 1;
  return counts;
}, {});
const retiredExecutableReferences = report.callers.filter((item) => item.classification === 'retired' && item.executable);
const unresolvedDynamicReferences = report.callers.filter((item) => item.dynamic);
const triggerReferences = report.callers.filter((item) => item.callerType === 'trigger');

const payload = {
  generatedAt: new Date().toISOString(),
  sourcePolicy: 'config/apps-script-entry-points.json',
  callerPolicy: 'config/apps-script-entry-point-callers.json',
  summary: {
    inventorySymbols: inventory.length,
    callerRecords: report.callers.length,
    callersByType,
    retiredExecutableReferences: retiredExecutableReferences.length,
    unresolvedDynamicReferences: unresolvedDynamicReferences.length,
    triggerReferences: triggerReferences.length,
    errors: report.errors.length
  },
  callers: report.callers,
  errors: report.errors
};

if (writeRequested) {
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Wrote ${path.relative(root, outputPath)}.`);
}

console.log(`Mapped ${report.callers.length} caller references across ${entryPolicy.projects.length} Apps Script projects.`);
console.log(`Caller counts: ${JSON.stringify(callersByType)}`);
console.log(`Retired executable references: ${retiredExecutableReferences.length}.`);
console.log(`Unresolved dynamic references: ${unresolvedDynamicReferences.length}.`);
console.log(`Repository trigger references: ${triggerReferences.length}.`);

if (report.errors.length) {
  console.error(report.errors.join('\n'));
  process.exitCode = 1;
}

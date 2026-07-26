#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import checker from './apps-script-entry-point-checker.cjs';

const {
  discoverDeclarations,
  classifySymbol,
  buildInventory,
  evaluateInventory,
  runCli
} = checker;

export {
  discoverDeclarations,
  classifySymbol,
  buildInventory,
  evaluateInventory
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}

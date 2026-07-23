#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--suite') args.suite = argv[++index];
    else if (value === '--target') args.target = argv[++index];
    else if (value === '--environment') args.environment = argv[++index];
    else if (value === '--authorize') args.authorize = argv[++index];
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (!args.suite) fail('Missing --suite.');
if (!args.target) fail('Missing --target.');
if (!args.environment) fail('Missing --environment.');

const registry = JSON.parse(readFileSync(resolve('config/live-smoke-suites.json'), 'utf8'));
const suite = registry.suites[args.suite];
if (!suite) fail(`Unknown live suite: ${args.suite}`);
if (suite.target !== args.target) fail(`Suite ${args.suite} is registered for target ${suite.target}, not ${args.target}.`);
if (suite.classification === 'blocked') fail(`Blocked live suite: ${suite.blockedReason}`);
if (String(args.environment).toLowerCase() === 'production') fail('Production live validation is blocked by default.');
if (suite.productionAllowed === false && String(args.environment).toLowerCase() === 'production') fail('This suite is not approved for production.');
if (suite.authorizationRequired && args.authorize !== 'YES_I_ACKNOWLEDGE_LIVE_MUTATION') {
  fail('Explicit mutation authorization is required.');
}

const report = {
  ok: true,
  mode: 'operator-handoff',
  suite: args.suite,
  target: args.target,
  environment: args.environment,
  classification: suite.classification,
  entryPoint: suite.entryPoint,
  requiredProperties: suite.requiredProperties || [],
  knownSideEffects: suite.knownSideEffects || [],
  executionPerformed: false,
  reason: 'This command validates authorization and emits the exact Apps Script entry point. It does not authenticate, deploy, or execute Apps Script.'
};

console.log(JSON.stringify(report, null, 2));

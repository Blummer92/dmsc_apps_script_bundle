#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function run(args) {
  return spawnSync(process.execPath, ['scripts/validate-live.mjs', ...args], {
    encoding: 'utf8'
  });
}

const readOnly = run([
  '--suite', 'root-read-only',
  '--target', 'root-dashboard',
  '--environment', 'staging'
]);
assert.equal(readOnly.status, 0, readOnly.stderr);
assert.match(readOnly.stdout, /"executionPerformed": false/);
assert.match(readOnly.stdout, /"classification": "read-only"/);

const missingAuthorization = run([
  '--suite', 'root-source-approval-round-trip',
  '--target', 'root-dashboard',
  '--environment', 'staging'
]);
assert.notEqual(missingAuthorization.status, 0);
assert.match(missingAuthorization.stderr, /Explicit mutation authorization is required/);

const authorized = run([
  '--suite', 'root-source-approval-round-trip',
  '--target', 'root-dashboard',
  '--environment', 'staging',
  '--authorize', 'YES_I_ACKNOWLEDGE_LIVE_MUTATION'
]);
assert.equal(authorized.status, 0, authorized.stderr);
assert.match(authorized.stdout, /runDmscAuthorizedSourceApprovalRoundTrip/);
assert.match(authorized.stdout, /"executionPerformed": false/);

const blockedLegacy = run([
  '--suite', 'legacy-backend-smoke-suite',
  '--target', 'root-dashboard',
  '--environment', 'staging',
  '--authorize', 'YES_I_ACKNOWLEDGE_LIVE_MUTATION'
]);
assert.notEqual(blockedLegacy.status, 0);
assert.match(blockedLegacy.stderr, /Blocked live suite/);

const production = run([
  '--suite', 'root-read-only',
  '--target', 'root-dashboard',
  '--environment', 'production'
]);
assert.notEqual(production.status, 0);
assert.match(production.stderr, /Production live validation is blocked by default/);

console.log('live validation gate self-tests passed');

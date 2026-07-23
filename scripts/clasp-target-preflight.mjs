#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function fingerprint(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

export function parseCandidatePaths(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[^A-Za-z0-9._/-]+/, ''))
    .filter(Boolean)
    .filter((line) => !line.startsWith('Files to push') && !line.startsWith('Untracked files'));
}

export function validateTarget(options) {
  const repoRoot = resolve(options.repoRoot || process.cwd());
  const registryPath = resolve(repoRoot, options.registryPath || 'config/apps-script-targets.json');
  const registry = readJson(registryPath);
  const target = registry.targets[options.targetName];
  const failures = [];
  const warnings = [];

  if (!target) {
    return { ok: false, failures: [`Unknown target: ${options.targetName}`], warnings, target: null };
  }

  const projectRoot = resolve(repoRoot, target.projectDir);
  const actualRoot = resolve(options.projectRoot || projectRoot);
  if (actualRoot !== projectRoot) failures.push(`Wrong project root. Expected ${projectRoot}; got ${actualRoot}.`);

  const configPath = resolve(actualRoot, '.clasp.json');
  if (!existsSync(configPath)) failures.push('Missing local .clasp.json.');
  const config = existsSync(configPath) ? readJson(configPath) : null;

  if (config) {
    if (!config.scriptId || config.scriptId === 'PASTE_SCRIPT_ID_HERE') failures.push('Local .clasp.json has no configured Script ID.');
    if (String(config.rootDir ?? '') !== String(target.rootDir ?? '')) failures.push(`rootDir mismatch. Expected ${JSON.stringify(target.rootDir)}.`);
    const expected = String(options.expectedScriptId || '').trim();
    if (!expected) failures.push(`Missing expected target value from ${target.expectedScriptIdEnv}.`);
    else if (config.scriptId !== expected) failures.push('Configured Script ID does not match the selected target.');
  }

  if (!existsSync(resolve(actualRoot, target.manifest))) failures.push(`Missing manifest: ${target.manifest}`);
  for (const file of target.requiredFiles || []) {
    if (!existsSync(resolve(actualRoot, file))) failures.push(`Missing required file: ${file}`);
  }
  if (target.claspIgnore && !existsSync(resolve(actualRoot, target.claspIgnore))) failures.push(`Missing ${target.claspIgnore}.`);

  const candidates = options.candidatePaths || [];
  for (const candidate of candidates) {
    const normalized = candidate.replace(/\\/g, '/').replace(/^\.\//, '');
    for (const prefix of target.forbiddenPrefixes || []) {
      if (normalized.startsWith(prefix)) failures.push(`Forbidden upload candidate: ${normalized}`);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    target: options.targetName,
    projectRoot,
    targetFingerprint: config && config.scriptId ? fingerprint(config.scriptId) : null,
    candidatePaths: candidates
  };
}

function parseArgs(argv) {
  const args = { withStatus: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--target') args.targetName = argv[++index];
    else if (value === '--repo-root') args.repoRoot = argv[++index];
    else if (value === '--project-root') args.projectRoot = argv[++index];
    else if (value === '--environment') args.environment = argv[++index];
    else if (value === '--with-status') args.withStatus = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.targetName) {
    console.error('Usage: node scripts/clasp-target-preflight.mjs --target <name> [--with-status]');
    process.exit(2);
  }
  const repoRoot = resolve(args.repoRoot || process.cwd());
  const registry = readJson(resolve(repoRoot, 'config/apps-script-targets.json'));
  const target = registry.targets[args.targetName];
  if (!target) {
    console.error(`Unknown target: ${args.targetName}`);
    process.exit(2);
  }
  const projectRoot = resolve(repoRoot, target.projectDir);
  let candidates = [];
  if (args.withStatus) {
    const result = spawnSync('npx', ['--yes', '@google/clasp@latest', 'show-file-status'], {
      cwd: projectRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) {
      console.error(`clasp show-file-status failed with status ${result.status ?? 1}.`);
      process.exit(result.status || 1);
    }
    candidates = parseCandidatePaths(result.stdout);
  }
  const expectedScriptId = process.env[target.expectedScriptIdEnv];
  const report = validateTarget({
    repoRoot,
    projectRoot: args.projectRoot || projectRoot,
    targetName: args.targetName,
    expectedScriptId,
    candidatePaths: candidates
  });
  console.log(JSON.stringify({
    ok: report.ok,
    target: report.target,
    environment: args.environment || 'unspecified',
    projectRoot: report.projectRoot,
    targetFingerprint: report.targetFingerprint ? `sha256:${report.targetFingerprint}` : null,
    candidateCount: report.candidatePaths.length,
    failures: report.failures,
    warnings: report.warnings,
    pushExecuted: false
  }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const EXPECTED_PROJECT_BASENAME = 'drive-metadata-dashboard';
const REQUIRED_FILES = [
  'src/NotionDryRun.gs',
  'src/SheetReadService.gs',
  'src/NotionSyncService.gs',
  'src/PropertyAliasService.gs',
  'src/AssetTypeMappingService.gs',
  'src/KeywordStrategyService.gs',
  'src/VisualAssetLibraryDryRunProofService.gs',
  'src/VisualAssetLibraryProductionSyncService.gs',
  'src/VisualAssetLibraryProductionManagerService.gs',
  'src/VisualAssetLibrarySyncHistoryService.gs',
  'src/VisualAssetLibrarySyncControl.gs',
  'src/VisualAssetLibraryProductionSyncTest.gs',
  'appsscript.json'
];

const failures = [];
const warnings = [];

function fingerprint(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    failures.push(`Invalid JSON in ${path}: ${error.message}`);
    return null;
  }
}

function main() {
  const cwd = process.cwd();
  const configPath = resolve(cwd, '.clasp.json');
  const expectedScriptId = String(process.env.DMSC_EXPECTED_SCRIPT_ID || '').trim();

  if (!cwd.endsWith('/' + EXPECTED_PROJECT_BASENAME) && !cwd.endsWith('\\' + EXPECTED_PROJECT_BASENAME)) {
    failures.push(`Wrong working directory. Run this command from ${EXPECTED_PROJECT_BASENAME}.`);
  }

  if (!existsSync(configPath)) {
    failures.push('Missing local .clasp.json. Copy .clasp.json.example, replace the placeholder locally, and retry.');
  }

  const config = existsSync(configPath) ? readJson(configPath) : null;
  if (config) {
    if (!config.scriptId || config.scriptId === 'PASTE_SCRIPT_ID_HERE') {
      failures.push('Local .clasp.json does not contain a configured Script ID.');
    }
    if (config.rootDir !== '.') {
      failures.push('Expected rootDir to be "." for drive-metadata-dashboard.');
    }
    if (!expectedScriptId) {
      failures.push('Set DMSC_EXPECTED_SCRIPT_ID locally so target identity can be verified without committing or logging the full ID.');
    } else if (config.scriptId !== expectedScriptId) {
      failures.push('Configured Script ID does not match the locally supplied expected target.');
    } else {
      console.log(`Target fingerprint: sha256:${fingerprint(config.scriptId)}`);
    }
  }

  const missing = REQUIRED_FILES.filter((file) => !existsSync(resolve(cwd, file)));
  if (missing.length) failures.push(`Missing required files: ${missing.join(', ')}`);

  if (existsSync(resolve(cwd, 'dmsc_apps_script_bundle'))) {
    warnings.push('Nested duplicate repository folder detected. Do not deploy from it.');
  }

  if (!failures.length) {
    const result = spawnSync('npx', ['--yes', '@google/clasp@latest', 'show-file-status'], {
      cwd,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error || result.status !== 0) {
      failures.push(`clasp show-file-status failed with status ${result.status ?? 1}.`);
    }
  }

  warnings.forEach((warning) => console.warn(`Warning: ${warning}`));
  failures.forEach((failure) => console.error(`Failure: ${failure}`));
  console.log(`Preflight passed: ${failures.length ? 'No' : 'Yes'}`);
  console.log('Push executed: No');
  console.log('Production deployment approved: No');
  process.exit(failures.length ? 1 : 0);
}

main();

#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const EXPECTED_PROJECT_ROOT = '/workspaces/dmsc_apps_script_bundle/drive-metadata-dashboard';
const EXPECTED_SCRIPT_ID = '1r8ZxoTdefHTE59qW9NuZqeBJHZhqg4XlKxNvV0fKP3u5uQa7Ov8vjKLr';
const REQUIRED_FILES = [
  'src/NotionDryRun.gs',
  'src/SheetReadService.gs',
  'src/NotionSyncService.gs',
  'src/PropertyAliasService.gs',
  'src/AssetTypeMappingService.gs',
  'src/KeywordStrategyService.gs',
  'src/VisualAssetLibraryProductionSyncService.gs',
  'src/VisualAssetLibraryProductionManagerService.gs',
  'src/VisualAssetLibrarySyncHistoryService.gs',
  'src/VisualAssetLibrarySyncControl.gs',
  'src/ClientVisualSyncPatch.html',
  'src/ClientVisualProductionSyncPatch.html',
  'src/VisualAssetLibraryProductionSyncTest.gs',
  'appsscript.json'
];
const TEST_FUNCTIONS = [
  'testVisualAssetLibraryProductionSyncTestSuite',
  'getVisualAssetLibraryProductionManager',
  'runVisualAssetLibraryProductionManager',
  'getVisualAssetLibrarySyncPanel',
  'runVisualAssetLibrarySyncBatch',
  'advanceVisualAssetLibrarySyncBatch',
  'resetVisualAssetLibrarySyncCursor'
];

const summary = {
  preflightPassed: false,
  correctProjectFolder: false,
  correctScriptId: false,
  requiredFilesPresent: false,
  requiredFilesTracked: false,
  pushCompleted: false
};

const failures = [];
const warnings = [];

function main() {
  printHeader('Drive Metadata Dashboard clasp preflight');
  console.log('Current working directory: ' + process.cwd());
  console.log('Expected project folder: ' + EXPECTED_PROJECT_ROOT);
  console.log('Expected Apps Script ID: ' + EXPECTED_SCRIPT_ID);

  checkProjectFolder();
  checkClaspConfig();
  checkNestedDuplicateFolder();
  listSrcFiles();
  checkRequiredFiles();

  if (failures.length) {
    printSummary();
    process.exit(1);
  }

  const statusBefore = runClasp('status');
  if (failures.length) {
    printSummary();
    process.exit(statusBefore.status || 1);
  }

  checkTrackedFiles(statusBefore.stdout + '\n' + statusBefore.stderr);
  if (!summary.requiredFilesTracked) {
    printSummary();
    process.exit(1);
  }

  summary.preflightPassed = true;

  const pushResult = runClasp('push');
  summary.pushCompleted = pushResult.status === 0;

  if (!summary.pushCompleted) {
    failures.push('clasp push failed. See output above.');
    printSummary();
    process.exit(pushResult.status || 1);
  }

  const statusAfter = runClasp('status');
  if (statusAfter.status !== 0) {
    summary.pushCompleted = false;
  }

  printSummary();
  process.exit(failures.length ? 1 : 0);
}

function checkProjectFolder() {
  summary.correctProjectFolder = process.cwd() === EXPECTED_PROJECT_ROOT;
  if (!summary.correctProjectFolder) {
    failures.push('Wrong folder. Run: cd ' + EXPECTED_PROJECT_ROOT);
  }
}

function checkClaspConfig() {
  const claspPath = resolve(process.cwd(), '.clasp.json');
  if (!existsSync(claspPath)) {
    failures.push('Missing .clasp.json. Fix: cd ' + EXPECTED_PROJECT_ROOT + ' && cp .clasp.json.example .clasp.json');
    return;
  }

  let config;
  try {
    config = JSON.parse(readFileSync(claspPath, 'utf8'));
  } catch (error) {
    failures.push('Invalid .clasp.json. Fix the JSON syntax in ' + claspPath + '. Error: ' + error.message);
    return;
  }

  summary.correctScriptId = config.scriptId === EXPECTED_SCRIPT_ID;
  if (!summary.correctScriptId) {
    failures.push('Wrong scriptId in .clasp.json. Fix: cd ' + EXPECTED_PROJECT_ROOT + ' && cp .clasp.json.example .clasp.json');
  }
}

function checkNestedDuplicateFolder() {
  const nestedPath = resolve(process.cwd(), 'dmsc_apps_script_bundle');
  if (existsSync(nestedPath)) {
    warnings.push('Nested duplicate folder detected: ' + nestedPath + '. Do not push from inside it.');
  }
}

function listSrcFiles() {
  const srcPath = resolve(process.cwd(), 'src');
  printHeader('src/ files');
  if (!existsSync(srcPath)) {
    console.log('(missing src folder)');
    return;
  }

  readdirSync(srcPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => 'src/' + entry.name)
    .sort()
    .forEach((file) => console.log(file));
}

function checkRequiredFiles() {
  const uniqueRequiredFiles = Array.from(new Set(REQUIRED_FILES));
  const missing = uniqueRequiredFiles.filter((file) => !existsSync(resolve(process.cwd(), file)));
  summary.requiredFilesPresent = missing.length === 0;
  if (missing.length) {
    failures.push('Missing required files: ' + missing.join(', ') + '. Fix: cd ' + EXPECTED_PROJECT_ROOT + ' && git pull');
  }
}

function runClasp(command) {
  printHeader('npx clasp ' + command);
  const result = spawnSync('npx', ['--yes', '@google/clasp@latest', command], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    failures.push('Failed to run clasp ' + command + ': ' + result.error.message + '. Fix: npm run clasp:login, then retry npm run clasp:preflight-push.');
    return { status: 1, stdout: '', stderr: result.error.message };
  }

  if (result.status !== 0) {
    failures.push('clasp ' + command + ' exited with status ' + result.status + '. Fix: npm run clasp:login, verify .clasp.json, then retry npm run clasp:preflight-push.');
  }

  return result;
}

function checkTrackedFiles(statusOutput) {
  const uniqueRequiredFiles = Array.from(new Set(REQUIRED_FILES));
  const missingTracked = uniqueRequiredFiles.filter((file) => !statusOutput.includes(file));
  summary.requiredFilesTracked = missingTracked.length === 0;
  if (!summary.requiredFilesTracked) {
    failures.push('Required files are not shown as tracked by clasp: ' + missingTracked.join(', ') + '. Fix: verify .claspignore includes appsscript.json and src/**, then run cd ' + EXPECTED_PROJECT_ROOT + ' && npx --yes @google/clasp@latest status.');
  }
}

function printSummary() {
  printHeader('Summary');
  warnings.forEach((warning) => console.warn('Warning: ' + warning));
  failures.forEach((failure) => console.error('Failure: ' + failure));
  console.log('Preflight passed: ' + yesNo(summary.preflightPassed));
  console.log('Correct project folder: ' + yesNo(summary.correctProjectFolder));
  console.log('Correct Script ID: ' + yesNo(summary.correctScriptId));
  console.log('Required files present: ' + yesNo(summary.requiredFilesPresent));
  console.log('Required files tracked by clasp: ' + yesNo(summary.requiredFilesTracked));
  console.log('Push completed: ' + yesNo(summary.pushCompleted));
  console.log('Exact Apps Script function names to test next:');
  TEST_FUNCTIONS.forEach((fn) => console.log('- ' + fn));
  if (failures.length) {
    console.log('Exact command to start fixing: cd ' + EXPECTED_PROJECT_ROOT + ' && git pull && cp .clasp.json.example .clasp.json && npm run clasp:preflight-push');
  }
  console.log('Production deployment approved: No');
  console.log('Notion sync executed by this script: No');
}

function printHeader(title) {
  console.log('\n== ' + title + ' ==');
}

function yesNo(value) {
  return value ? 'Yes' : 'No';
}

main();
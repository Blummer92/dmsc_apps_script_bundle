#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const claspConfigPath = resolve(projectRoot, '.clasp.json');
const command = process.argv[2] || 'push';
const allowedCommands = new Set(['push', 'status', 'open', 'login']);

function main() {
  if (command === 'pull' && !hasFlag('--allow-pull')) {
    fail('Blocked: clasp pull can overwrite local project files. Re-run with --allow-pull only after you confirm Apps Script has newer edits you want locally.');
  }

  if (!allowedCommands.has(command) && command !== 'pull') {
    fail('Unsupported command: ' + command + '. Use push, status, open, login, or pull --allow-pull.');
  }

  if (command !== 'login') {
    ensureClaspConfig();
  }

  const args = ['--yes', '@google/clasp@latest', command];
  const result = spawnSync('npx', args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.error) {
    fail(result.error.message);
  }
  process.exit(result.status || 0);
}

function ensureClaspConfig() {
  const existing = readClaspConfig();
  const scriptId = process.env.SCRIPT_ID || process.env.CLASP_SCRIPT_ID || existing.scriptId;
  const projectId = process.env.GCP_PROJECT_ID || process.env.CLASP_PROJECT_ID || existing.projectId;

  if (!scriptId || scriptId === 'PASTE_SCRIPT_ID_HERE') {
    fail('Missing Script ID. Run with SCRIPT_ID=<your Apps Script Script ID> npm run clasp:push');
  }

  const config = {
    scriptId,
    rootDir: '.',
  };

  if (projectId && projectId !== 'OPTIONAL_GOOGLE_CLOUD_PROJECT_ID') {
    config.projectId = projectId;
  }

  writeFileSync(claspConfigPath, JSON.stringify(config, null, 2) + '\n');
}

function readClaspConfig() {
  if (!existsSync(claspConfigPath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(claspConfigPath, 'utf8'));
  } catch (error) {
    fail('Could not read .clasp.json: ' + error.message);
  }
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

main();

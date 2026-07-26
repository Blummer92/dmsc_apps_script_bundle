'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const corePath = path.join(repositoryRoot, 'scripts/apps-script-entry-point-checker.cjs');
const wrapperPath = path.join(repositoryRoot, 'scripts/check-apps-script-entry-points.mjs');
const generatedInventoryPath = path.join(repositoryRoot, 'docs/apps-script-entry-point-inventory.json');
const temporaryDirectories = [];

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true
  });
  if (result.error) throw result.error;
  return result;
}

function createFixture({ duplicate = false } = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dmsc-entry-point-wrapper-'));
  temporaryDirectories.push(fixtureRoot);
  fs.mkdirSync(path.join(fixtureRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'config'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'src'), { recursive: true });
  fs.copyFileSync(corePath, path.join(fixtureRoot, 'scripts/apps-script-entry-point-checker.cjs'));
  fs.copyFileSync(wrapperPath, path.join(fixtureRoot, 'scripts/check-apps-script-entry-points.mjs'));
  fs.writeFileSync(
    path.join(fixtureRoot, 'src', 'Example.gs'),
    duplicate ? 'function duplicate() {}\nfunction duplicate() {}\n' : 'function fixtureCommand() {}\n'
  );
  const fixturePolicy = {
    projects: [{ name: 'fixture', root: 'src', recursive: true }],
    excludedDirectories: [],
    explicitClassifications: duplicate
      ? { duplicate: 'manual_review' }
      : { fixtureCommand: 'read_only' },
    classificationRules: [],
    temporaryDuplicateExceptions: {}
  };
  fs.writeFileSync(
    path.join(fixtureRoot, 'config/apps-script-entry-points.json'),
    `${JSON.stringify(fixturePolicy, null, 2)}\n`
  );
  return {
    fixtureRoot,
    fixturePolicy,
    fixtureWrapperPath: path.join(fixtureRoot, 'scripts/check-apps-script-entry-points.mjs')
  };
}

function snapshotGeneratedInventory() {
  if (!fs.existsSync(generatedInventoryPath)) return { exists: false };
  const stats = fs.statSync(generatedInventoryPath);
  return {
    exists: true,
    contents: fs.readFileSync(generatedInventoryPath, 'utf8'),
    mtimeMs: stats.mtimeMs
  };
}

afterAll(() => {
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('Apps Script entry-point ESM wrapper', () => {
  test('imports in a separate Node process with exactly the supported callable exports', () => {
    const { fixtureRoot, fixturePolicy } = createFixture();
    const script = `
      import * as wrapper from ${JSON.stringify(pathToFileURL(wrapperPath).href)};
      const expected = ['buildInventory', 'classifySymbol', 'discoverDeclarations', 'evaluateInventory'];
      const actual = Object.keys(wrapper).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error('Unexpected exports: ' + JSON.stringify(actual));
      }
      for (const name of expected) {
        if (typeof wrapper[name] !== 'function') throw new Error(name + ' is not callable');
      }
      const declarations = wrapper.discoverDeclarations('function fixtureCommand() {}\\n', 'Example.gs', 'fixture');
      if (declarations.length !== 1) throw new Error('Declaration discovery failed');
      if (wrapper.classifySymbol('fixtureCommand', ${JSON.stringify(fixturePolicy)}) !== 'read_only') {
        throw new Error('Classification failed');
      }
      const inventory = wrapper.buildInventory(${JSON.stringify(fixtureRoot)}, ${JSON.stringify(fixturePolicy)});
      if (inventory.length !== 1) throw new Error('Inventory build failed');
      if (wrapper.evaluateInventory(inventory).length !== 0) throw new Error('Inventory evaluation failed');
    `;

    const result = runNode(['--input-type=module', '--eval', script]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  test('runs current-repository check mode without creating or modifying the generated inventory', () => {
    const before = snapshotGeneratedInventory();

    const result = runNode([wrapperPath, '--no-write']);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Classified \d+ deployable symbols across \d+ Apps Script projects\.\n$/);
    expect(result.stderr).toBe('');
    expect(snapshotGeneratedInventory()).toEqual(before);
  });

  test('returns a nonzero status for inventory errors without writing an artifact', () => {
    const { fixtureRoot, fixtureWrapperPath } = createFixture({ duplicate: true });
    const result = runNode([fixtureWrapperPath, '--no-write']);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('Classified 1 deployable symbols across 1 Apps Script projects.\n');
    expect(result.stderr).toMatch(/fixture:duplicate: duplicate declarations/);
    expect(fs.existsSync(path.join(fixtureRoot, 'docs/apps-script-entry-point-inventory.json'))).toBe(false);
  });

  test('rejects unknown arguments', () => {
    const { fixtureWrapperPath } = createFixture();
    const result = runNode([fixtureWrapperPath, '--unknown-option']);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Unknown argument: --unknown-option\n');
  });

  test('keeps intentional inventory generation available', () => {
    const { fixtureRoot, fixtureWrapperPath } = createFixture();
    const result = runNode([fixtureWrapperPath]);
    const outputPath = path.join(fixtureRoot, 'docs/apps-script-entry-point-inventory.json');

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('Classified 1 deployable symbols across 1 Apps Script projects.\n');
    expect(result.stderr).toBe('');
    expect(fs.existsSync(outputPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(report.inventory).toHaveLength(1);
    expect(report.inventory[0].symbol).toBe('fixtureCommand');
  });
});

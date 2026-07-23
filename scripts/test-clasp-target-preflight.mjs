#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateTarget } from './clasp-target-preflight.mjs';

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'clasp-preflight-'));
  mkdirSync(join(root, 'config'), { recursive: true });
  mkdirSync(join(root, 'project', 'src'), { recursive: true });
  writeFileSync(join(root, 'config', 'apps-script-targets.json'), JSON.stringify({
    version: 1,
    targets: {
      demo: {
        projectDir: 'project',
        manifest: 'appsscript.json',
        rootDir: '.',
        claspIgnore: '.claspignore',
        expectedScriptIdEnv: 'DEMO_EXPECTED_SCRIPT_ID',
        requiredFiles: ['appsscript.json', 'src/Code.gs'],
        forbiddenPrefixes: ['sibling/', '../']
      }
    }
  }, null, 2));
  writeFileSync(join(root, 'project', 'appsscript.json'), '{}');
  writeFileSync(join(root, 'project', 'src', 'Code.gs'), 'function demo() {}');
  writeFileSync(join(root, 'project', '.claspignore'), '**/**\n!appsscript.json\n!src/**\n');
  writeFileSync(join(root, 'project', '.clasp.json'), JSON.stringify({ scriptId: 'local-target-123', rootDir: '.' }));
  return root;
}

function run() {
  const root = createFixture();
  const projectRoot = resolve(root, 'project');

  const valid = validateTarget({
    repoRoot: root,
    projectRoot,
    targetName: 'demo',
    expectedScriptId: 'local-target-123',
    candidatePaths: ['appsscript.json', 'src/Code.gs']
  });
  assert.equal(valid.ok, true, valid.failures.join('\n'));

  const wrongDirectory = validateTarget({
    repoRoot: root,
    projectRoot: root,
    targetName: 'demo',
    expectedScriptId: 'local-target-123'
  });
  assert.equal(wrongDirectory.ok, false);
  assert.match(wrongDirectory.failures.join('\n'), /Wrong project root/);

  const wrongTarget = validateTarget({
    repoRoot: root,
    projectRoot,
    targetName: 'demo',
    expectedScriptId: 'different-target'
  });
  assert.equal(wrongTarget.ok, false);
  assert.match(wrongTarget.failures.join('\n'), /does not match/);

  const siblingLeak = validateTarget({
    repoRoot: root,
    projectRoot,
    targetName: 'demo',
    expectedScriptId: 'local-target-123',
    candidatePaths: ['sibling/Other.gs']
  });
  assert.equal(siblingLeak.ok, false);
  assert.match(siblingLeak.failures.join('\n'), /Forbidden upload candidate/);

  const unknown = validateTarget({
    repoRoot: root,
    projectRoot,
    targetName: 'missing',
    expectedScriptId: 'local-target-123'
  });
  assert.equal(unknown.ok, false);
  assert.match(unknown.failures.join('\n'), /Unknown target/);

  console.log('clasp target preflight self-tests passed');
}

run();

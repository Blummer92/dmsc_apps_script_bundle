#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadGsConstants(relPath, names) {
  const gsSource = readFileSync(resolve(repoRoot, relPath), 'utf8');
  const collectorEntries = names
    .map((name) => `${JSON.stringify(name)}: (typeof ${name} !== 'undefined' ? ${name} : null)`)
    .join(', ');
  const wrapped = `${gsSource}\n;JSON.stringify({ ${collectorEntries} });`;
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  const json = vm.runInContext(wrapped, ctx, { timeout: 1000, filename: relPath });
  return JSON.parse(json);
}

function loadJson(relPath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relPath), 'utf8'));
}

function diffSets(report, project, label, gsList, jsonList, { ignoreJsonOnly = [] } = {}) {
  const gsSet = new Set(gsList);
  const jsonSet = new Set(jsonList);
  const ignoreSet = new Set(ignoreJsonOnly);

  gsList.forEach((field) => {
    if (!jsonSet.has(field)) {
      report.failures.push(`${project} ${label}: '${field}' only in Config.gs, missing from JSON.`);
    }
  });

  jsonList.forEach((field) => {
    if (!gsSet.has(field) && !ignoreSet.has(field)) {
      report.failures.push(`${project} ${label}: '${field}' only in JSON, missing from Config.gs.`);
    }
  });
}

function assertSubset(report, project, label, subsetList, supersetList) {
  const supersetSet = new Set(supersetList);
  subsetList.forEach((field) => {
    if (!supersetSet.has(field)) {
      report.failures.push(`${project} ${label}: '${field}' not found in Config.gs field enum.`);
    }
  });
}

function diffFieldContract(report, project, label, gsContract, jsonFields, { keyGs, keyJson, compareKeys }) {
  const gsByField = new Map(gsContract.map((row) => [row[keyGs], row]));
  const jsonByField = new Map(jsonFields.map((row) => [row[keyJson], row]));

  gsByField.forEach((_row, field) => {
    if (!jsonByField.has(field)) {
      report.failures.push(`${project} ${label}: '${field}' only in Config.gs, missing from JSON.`);
    }
  });

  jsonByField.forEach((_row, field) => {
    if (!gsByField.has(field)) {
      report.failures.push(`${project} ${label}: '${field}' only in JSON, missing from Config.gs.`);
    }
  });

  gsByField.forEach((gsRow, field) => {
    const jsonRow = jsonByField.get(field);
    if (!jsonRow) return;
    compareKeys.forEach((key) => {
      if (gsRow[key] !== jsonRow[key]) {
        report.failures.push(
          `${project} ${label}: '${field}'.${key} differs (Config.gs=${JSON.stringify(gsRow[key])}, JSON=${JSON.stringify(jsonRow[key])}).`
        );
      }
    });
  });
}

const CHECKS = [
  {
    id: 'apps-script-builder-dashboard',
    gsFile: 'apps-script-builder-dashboard/src/Config.gs',
    gsNames: ['FIELD_CONTRACT', 'WRITABLE_OPERATIONAL_FIELDS', 'DENIED_SYNC_FIELDS'],
    jsonFiles: {
      fieldContract: 'apps-script-builder-dashboard/metadata/field-contract.json',
      schemaMap: 'apps-script-builder-dashboard/metadata/schema-map.json'
    },
    run(gs, json, report) {
      diffFieldContract(report, this.id, 'field-contract', gs.FIELD_CONTRACT, json.fieldContract.fields, {
        keyGs: 'field_name',
        keyJson: 'field',
        compareKeys: ['owner_database', 'consuming_database', 'blocked_until_owner_review']
      });
      diffSets(report, this.id, 'writable_field_allowlist', gs.WRITABLE_OPERATIONAL_FIELDS, json.schemaMap.writable_field_allowlist);
      diffSets(report, this.id, 'denylist', gs.DENIED_SYNC_FIELDS, json.schemaMap.denylist);
    }
  },
  {
    id: 'drive-metadata-dashboard',
    gsFile: 'drive-metadata-dashboard/src/Config.gs',
    gsNames: ['APP_CONFIG'],
    jsonFiles: {
      schemaMap: 'drive-metadata-dashboard/metadata/schema-map.json'
    },
    run(gs, json, report) {
      const fieldValues = Object.values(gs.APP_CONFIG.FIELDS);
      assertSubset(report, this.id, 'required_sheet_fields', json.schemaMap.required_sheet_fields, fieldValues);
      json.schemaMap.computed_fields
        .filter((field) => fieldValues.includes(field))
        .forEach((field) => {
          report.warnings.push(
            `${this.id} computed_fields: '${field}' also appears in Config.gs FIELDS enum — should be sheet-only or computed-only, not both.`
          );
        });
    }
  },
  {
    id: 'search-feature-app',
    gsFile: 'search-feature-app/src/Config.gs',
    gsNames: ['APP_CONFIG'],
    jsonFiles: {
      schemaMap: 'search-feature-app/metadata/schema-map.json'
    },
    run(gs, json, report) {
      const fieldValues = Object.values(gs.APP_CONFIG.FIELDS);
      diffSets(report, this.id, 'expected_sheet_headers', fieldValues, json.schemaMap.expected_sheet_headers);

      const fieldsListValues = json.schemaMap.fields.map((row) => row.field);
      fieldValues.forEach((field) => {
        if (!fieldsListValues.includes(field)) {
          report.warnings.push(
            `${this.id} schema-map fields[]: '${field}' is in expected_sheet_headers but has no governance entry in fields[].`
          );
        }
      });
    }
  }
];

function printHeader(title) {
  console.log('\n== ' + title + ' ==');
}

function yesNo(value) {
  return value ? 'Yes' : 'No';
}

function main() {
  const report = { failures: [], warnings: [] };
  const summary = {};

  CHECKS.forEach((check) => {
    printHeader(check.id);
    const before = report.failures.length;
    try {
      const gs = loadGsConstants(check.gsFile, check.gsNames);
      const json = {};
      Object.entries(check.jsonFiles).forEach(([key, relPath]) => {
        json[key] = loadJson(relPath);
      });
      check.run(gs, json, report);
    } catch (error) {
      report.failures.push(`${check.id}: failed to load/compare — ${error.message}`);
    }
    summary[check.id] = report.failures.length === before;
  });

  printHeader('Summary');
  report.warnings.forEach((warning) => console.warn('Warning: ' + warning));
  report.failures.forEach((failure) => console.error('Failure: ' + failure));
  Object.entries(summary).forEach(([id, inSync]) => {
    console.log(id + ' in sync: ' + yesNo(inSync));
  });
  console.log('No drift found: ' + yesNo(report.failures.length === 0));

  process.exit(report.failures.length ? 1 : 0);
}

function runSelfTest() {
  const results = [];
  const expect = (condition, description) => results.push({ ok: Boolean(condition), description });

  const fcDir = 'scripts/__fixtures__/field-contract-project';
  const gs1 = loadGsConstants(`${fcDir}/Config.gs`, ['FIELD_CONTRACT', 'WRITABLE_OPERATIONAL_FIELDS', 'DENIED_SYNC_FIELDS']);
  const fieldContractJson = loadJson(`${fcDir}/field-contract.json`);
  const schemaMapJson1 = loadJson(`${fcDir}/schema-map.json`);

  const report1 = { failures: [], warnings: [] };
  diffFieldContract(report1, 'fixture', 'field-contract', gs1.FIELD_CONTRACT, fieldContractJson.fields, {
    keyGs: 'field_name',
    keyJson: 'field',
    compareKeys: ['owner_database', 'consuming_database', 'blocked_until_owner_review']
  });
  diffSets(report1, 'fixture', 'writable_field_allowlist', gs1.WRITABLE_OPERATIONAL_FIELDS, schemaMapJson1.writable_field_allowlist);
  diffSets(report1, 'fixture', 'denylist', gs1.DENIED_SYNC_FIELDS, schemaMapJson1.denylist);

  expect(report1.failures.some((f) => f.includes("'gamma_only_in_gs'")), 'flags a field only in Config.gs FIELD_CONTRACT');
  expect(report1.failures.some((f) => f.includes("'delta_only_in_json'")), 'flags a field only in JSON field-contract');
  expect(!report1.failures.some((f) => f.includes('classification')), 'does not flag classification wording differences');
  expect(!report1.failures.some((f) => f.includes('safe_sync_rule')), 'does not flag safe_sync_rule wording differences');
  expect(report1.failures.length === 2, `field-contract fixture produces exactly 2 failures (got ${report1.failures.length})`);

  const enumDir = 'scripts/__fixtures__/enum-project';
  const gs2 = loadGsConstants(`${enumDir}/Config.gs`, ['APP_CONFIG']);
  const schemaMapJson2 = loadJson(`${enumDir}/schema-map.json`);
  const fieldValues2 = Object.values(gs2.APP_CONFIG.FIELDS);

  const report2 = { failures: [], warnings: [] };
  assertSubset(report2, 'fixture', 'required_sheet_fields', schemaMapJson2.required_sheet_fields, fieldValues2);
  expect(report2.failures.some((f) => f.includes("'delta_missing_from_gs'")), 'flags a required_sheet_fields entry missing from the FIELDS enum');
  expect(!report2.failures.some((f) => f.includes("'alpha'")), 'does not flag a required_sheet_fields entry that exists in the FIELDS enum');

  const report3 = { failures: [], warnings: [] };
  schemaMapJson2.computed_fields
    .filter((field) => fieldValues2.includes(field))
    .forEach((field) => report3.warnings.push(`fixture computed_fields: '${field}' also appears in FIELDS enum.`));
  expect(report3.failures.length === 0, 'computed_fields overlap is a warning, never a failure');
  expect(report3.warnings.some((w) => w.includes("'beta'")), 'flags a computed_fields value that collides with the FIELDS enum as a warning');

  const report4 = { failures: [], warnings: [] };
  diffSets(report4, 'fixture', 'expected_sheet_headers', fieldValues2, schemaMapJson2.expected_sheet_headers);
  expect(report4.failures.some((f) => f.includes("'gamma_only_in_gs'")), 'flags a FIELDS enum entry missing from expected_sheet_headers');

  const failed = results.filter((r) => !r.ok);
  results.forEach((r) => console.log((r.ok ? 'PASS' : 'FAIL') + ' - ' + r.description));
  console.log(`\nSelf-test: ${results.length - failed.length}/${results.length} passed.`);
  process.exit(failed.length ? 1 : 0);
}

if (process.argv.includes('--self-test')) {
  runSelfTest();
} else {
  main();
}

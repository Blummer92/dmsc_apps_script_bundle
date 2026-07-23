'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const fixtures = require('../fixtures/notion-api/compatibility-cases.json');

describe('Notion API compatibility inventory', () => {
  test('documents one temporary API-version decision and migration boundary', () => {
    const document = fs.readFileSync(path.join(root, 'docs/notion-api-compatibility.md'), 'utf8');
    expect(document).toContain('Remain temporarily on `Notion-Version: 2022-06-28`');
    expect(document).toContain('zero or multiple data sources are blocked');
    expect(document).toContain('#39 must replace them with one injectable adapter');
  });

  test('covers legacy and newer response shapes', () => {
    expect(fixtures.legacyDatabase.object).toBe('database');
    expect(fixtures.legacyQueryPage1.has_more).toBe(true);
    expect(fixtures.legacyQueryPage2.has_more).toBe(false);
    expect(fixtures.newDataSource.object).toBe('data_source');
    expect(fixtures.multiSourceDatabase.data_sources).toHaveLength(2);
  });

  test('represents duplicate identity and unknown write outcomes explicitly', () => {
    expect(fixtures.duplicateFileIdQuery.results).toHaveLength(2);
    expect(fixtures.errors.ambiguousCreate.kind).toBe('UNKNOWN_OUTCOME');
    expect(fixtures.errors.ambiguousUpdate.kind).toBe('UNKNOWN_OUTCOME');
    expect(fixtures.errors.preResponseFailure.responseReceived).toBe(false);
  });

  test('contains no bearer tokens or live integration secrets', () => {
    const serialized = JSON.stringify(fixtures);
    expect(serialized).not.toMatch(/Bearer\s+/i);
    expect(serialized).not.toMatch(/secret_/i);
    expect(serialized).not.toMatch(/ntn_/i);
  });
});

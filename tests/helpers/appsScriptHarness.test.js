'use strict';

const {
  createAppsScriptHarness,
  createAppsScriptRuntime,
  createSpreadsheetFixture
} = require('./appsScriptHarness.js');

describe('Apps Script production-source harness', () => {
  test('loads sources in declared order and preserves global override behavior', () => {
    const harness = createAppsScriptHarness();

    harness.loadSource('function marker() { return "first"; }', 'first.gs');
    harness.loadSource('function marker() { return "second"; }', 'second.gs');

    expect(harness.getFunction('marker')()).toBe('second');
    expect(harness.getLoadedFiles().map((entry) => entry.path)).toEqual(['first.gs', 'second.gs']);
    expect(harness.listFunctions()).toContain('marker');
  });

  test('fails clearly when production code accesses an undeclared global', () => {
    const harness = createAppsScriptHarness();
    harness.loadSource('function useMissingService() { return MissingService.run(); }', 'missing.gs');

    expect(() => harness.getFunction('useMissingService')()).toThrow('MissingService is not defined');
  });

  test('blocks network access unless fetch is explicitly injected', () => {
    const harness = createAppsScriptHarness();
    harness.loadSource('function callNetwork() { return UrlFetchApp.fetch("https://example.invalid"); }', 'network.gs');

    expect(() => harness.getFunction('callNetwork')()).toThrow('Network access is disabled');
    expect(harness.runtime.getEvents('urlFetch.fetch')).toHaveLength(1);
  });

  test('records properties, locks, flushes, and injected failures', () => {
    const runtime = createAppsScriptRuntime({ lockAvailable: false });
    const harness = createAppsScriptHarness({ runtime });
    harness.loadSource(`
      function exerciseRuntime() {
        PropertiesService.getScriptProperties().setProperty('MODE', 'TEST');
        var lock = LockService.getScriptLock();
        if (!lock.tryLock(25)) throw new Error('lock timeout');
        SpreadsheetApp.flush();
      }
    `, 'runtime.gs');

    expect(() => harness.getFunction('exerciseRuntime')()).toThrow('lock timeout');
    expect(runtime.getEvents('properties.set')).toEqual([
      { type: 'properties.set', key: 'MODE', value: 'TEST' }
    ]);
    expect(runtime.getEvents('lock.try')).toEqual([{ type: 'lock.try', timeoutMs: 25 }]);
    expect(runtime.getEvents('spreadsheet.flush')).toHaveLength(0);
  });

  test('provides stateful spreadsheet fixtures and write evidence', () => {
    const fixture = createSpreadsheetFixture({ Sheet1: [['Header'], ['Before']] });
    const runtime = createAppsScriptRuntime({ spreadsheet: fixture.spreadsheet });
    const harness = createAppsScriptHarness({ runtime });
    harness.loadSource(`
      function writeFixture() {
        var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
        sheet.getRange(2, 1).setValue('After');
      }
    `, 'sheet.gs');

    harness.getFunction('writeFixture')();

    expect(fixture.spreadsheet.__getSheet('Sheet1').__getRows()[1][0]).toBe('After');
    expect(fixture.spreadsheet.__getSheet('Sheet1').__getEvents()).toContainEqual({
      type: 'range.setValue', row: 2, column: 1, value: 'After'
    });
  });
});

'use strict';

const {
  createAppsScriptHarness,
  createAppsScriptRuntime,
  createSpreadsheetFixture
} = require('../helpers/appsScriptHarness.js');

function buildHarness(includeAuditSheet = true) {
  const sheets = includeAuditSheet
    ? {
        'DMSC Audit Log': [[
          'Timestamp', 'Actor', 'Image Identity ID', 'Action',
          'Field', 'Old Value', 'New Value', 'Source'
        ]]
      }
    : {};
  const fixture = createSpreadsheetFixture(sheets);
  const runtime = createAppsScriptRuntime({
    spreadsheet: fixture.spreadsheet,
    activeUserEmail: 'auditor@example.com'
  });
  const harness = createAppsScriptHarness({ runtime });
  harness.loadFiles(['Code.gs']);
  return { harness, fixture };
}

describe('appendAuditEntry_() production source', () => {
  test('writes all changes in one range operation', () => {
    const { harness, fixture } = buildHarness();
    const appendAuditEntry = harness.getFunction('appendAuditEntry_');

    appendAuditEntry('id-001', 'Routing Update', [
      { field: 'Review Reason', oldValue: '', newValue: 'Needs review' },
      { field: 'Next Owner', oldValue: 'A', newValue: 'B' }
    ], 'Dashboard UI');

    const auditSheet = fixture.spreadsheet.__getSheet('DMSC Audit Log');
    const rows = auditSheet.__getRows();
    expect(rows).toHaveLength(3);
    expect(rows[1].slice(1)).toEqual([
      'auditor@example.com',
      'id-001',
      'Routing Update',
      'Review Reason',
      '',
      'Needs review',
      'Dashboard UI'
    ]);
    expect(auditSheet.__getEvents().filter((event) => event.type === 'range.setValues')).toHaveLength(1);
  });

  test('creates the audit sheet with the production header when missing', () => {
    const { harness, fixture } = buildHarness(false);
    const appendAuditEntry = harness.getFunction('appendAuditEntry_');

    appendAuditEntry('SYSTEM', 'Scan Triggered', [
      { field: 'Action', oldValue: '', newValue: 'runDriveImageScanOnly' }
    ], 'Dashboard UI');

    const auditSheet = fixture.spreadsheet.__getSheet('DMSC Audit Log');
    expect(auditSheet).not.toBeNull();
    expect(auditSheet.__getRows()[0]).toEqual([
      'Timestamp', 'Actor', 'Image Identity ID', 'Action',
      'Field', 'Old Value', 'New Value', 'Source'
    ]);
    expect(auditSheet.__getFrozenRows()).toBe(1);
  });

  test('does not append a row for an empty change list', () => {
    const { harness, fixture } = buildHarness();
    const appendAuditEntry = harness.getFunction('appendAuditEntry_');

    appendAuditEntry('id-001', 'No-op', [], 'Dashboard UI');

    expect(fixture.spreadsheet.__getSheet('DMSC Audit Log').__getRows()).toHaveLength(1);
  });
});

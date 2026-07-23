'use strict';

const {
  createAppsScriptHarness,
  createAppsScriptRuntime,
  createSpreadsheetFixture
} = require('../helpers/appsScriptHarness.js');

const SOURCE_HEADERS = [
  'file_id',
  'source_approval_status',
  'approval_evidence_url',
  'approved_by',
  'approval_date',
  'restrictions',
  'approved_prompt',
  'approved_prompt_source',
  'source_notes',
  'pilot_review_status'
];

const AUDIT_HEADERS = [
  'Timestamp', 'Actor', 'Image Identity ID', 'Action',
  'Field', 'Old Value', 'New Value', 'Source'
];

function buildHarness(options = {}) {
  const sourceRows = options.sourceRows || [
    SOURCE_HEADERS,
    ['file-1', 'Pending', '', '', '', '', '', '', '', 'Pilot Review Only']
  ];
  const sheets = {};
  if (options.includeSource !== false) sheets['DM Source Library Pilot'] = sourceRows;
  if (options.includeAudit !== false) sheets['DMSC Audit Log'] = [options.auditHeaders || AUDIT_HEADERS];

  const fixture = createSpreadsheetFixture(sheets);
  const runtime = createAppsScriptRuntime({
    spreadsheet: fixture.spreadsheet,
    lockAvailable: options.lockAvailable
  });
  const harness = createAppsScriptHarness({ runtime });
  harness.loadSource(`
    const DMSC_APP_CONFIG = {
      sourceLibrarySheetName: 'DM Source Library Pilot',
      auditLogSheetName: 'DMSC Audit Log'
    };
    function getDashboardSpreadsheet_() { return SpreadsheetApp.getActiveSpreadsheet(); }
  `, 'preflight-test-config.gs');
  harness.loadFiles(['DMSC_SourceApprovalPreflight.gs']);
  return { harness, runtime, fixture };
}

function validPayload(overrides = {}) {
  return {
    fileId: 'file-1',
    operationId: 'operation-1',
    actor: 'reviewer@example.com',
    source: 'Source approval UI',
    action: 'DMSC Source Approval',
    updates: {
      source_approval_status: 'Approved',
      approval_evidence_url: 'https://example.invalid/evidence'
    },
    ...overrides
  };
}

function writeEvents(fixture, runtime) {
  const sheetEvents = fixture.spreadsheet.getSheets().flatMap((sheet) => sheet.__getEvents());
  return sheetEvents.concat(runtime.getEvents()).filter((event) =>
    /setValue|setValues|appendRow|insertSheet|properties\.set|setBackground|setNote|setFontWeight/.test(event.type)
  );
}

describe('source approval preflight production source', () => {
  test('returns READY_FOR_COMMIT with captured originals and no writes', () => {
    const { harness, runtime, fixture } = buildHarness();
    const withLock = harness.getFunction('withDmscSourceApprovalLock_');

    const result = withLock(validPayload());

    expect(result.status).toBe('READY_FOR_COMMIT');
    expect(result.rowNumber).toBe(2);
    expect(result.originalValues.source_approval_status).toBe('Pending');
    expect(result.lockAcquired).toBe(true);
    expect(result.writeEvidence).toEqual({
      sourceWrites: 0,
      auditWrites: 0,
      propertyWrites: 0,
      formatWrites: 0
    });
    expect(writeEvents(fixture, runtime)).toEqual([]);
    expect(runtime.getEvents('lock.release')).toHaveLength(1);
  });

  test.each([
    ['missing source sheet', { includeSource: false }, /Missing source library sheet/],
    ['missing audit sheet', { includeAudit: false }, /Missing audit log sheet/],
    ['lock timeout', { lockAvailable: false }, /Script lock unavailable/],
    ['malformed audit schema', { auditHeaders: ['Timestamp', 'Actor'] }, /Missing audit header/]
  ])('blocks %s before any write', (_name, fixtureOptions, expected) => {
    const { harness, runtime, fixture } = buildHarness(fixtureOptions);
    const withLock = harness.getFunction('withDmscSourceApprovalLock_');

    const result = withLock(validPayload());

    expect(result.status).toBe('BLOCKED_BEFORE_WRITE');
    expect(result.blockers.join(' ')).toMatch(expected);
    expect(writeEvents(fixture, runtime)).toEqual([]);
  });

  test('blocks duplicate exact file_id matches', () => {
    const duplicateRows = [
      SOURCE_HEADERS,
      ['file-1', 'Pending', '', '', '', '', '', '', '', 'Pilot Review Only'],
      ['file-1', 'Pending', '', '', '', '', '', '', '', 'Pilot Review Only']
    ];
    const { harness, runtime, fixture } = buildHarness({ sourceRows: duplicateRows });
    const result = harness.getFunction('withDmscSourceApprovalLock_')(validPayload());

    expect(result.status).toBe('BLOCKED_BEFORE_WRITE');
    expect(result.blockers).toContain('Duplicate source rows found for file_id: file-1');
    expect(writeEvents(fixture, runtime)).toEqual([]);
  });

  test('retains the same lock while invoking the future commit callback', () => {
    const { harness, runtime } = buildHarness();
    const withLock = harness.getFunction('withDmscSourceApprovalLock_');

    const result = withLock(validPayload(), (preflight) => ({
      status: 'CALLBACK_OBSERVED',
      lockHeld: runtime.scriptLock.hasLock(),
      operationId: preflight.operationId
    }));

    expect(result).toEqual({
      status: 'CALLBACK_OBSERVED',
      lockHeld: true,
      operationId: 'operation-1'
    });
    expect(runtime.scriptLock.hasLock()).toBe(false);
    expect(runtime.getEvents('lock.release')).toHaveLength(1);
  });
});

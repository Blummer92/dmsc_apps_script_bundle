'use strict';

const {
  createAppsScriptHarness,
  createAppsScriptRuntime,
  createSpreadsheetFixture
} = require('../helpers/appsScriptHarness.js');

const REGISTRY_HEADERS = [
  'Image Identity ID',
  'File ID',
  'Filename',
  'Human Review Required',
  'Review Reason',
  'Next Owner',
  'Notes',
  'Metadata Classification Status',
  'Last Metadata Sync Timestamp'
];

function buildHarness(options = {}) {
  const registryRows = [
    REGISTRY_HEADERS,
    ['id-001', 'file-001', 'photo.jpg', 'No', '', 'Content Team', '', 'Pending', '']
  ];
  const fixture = createSpreadsheetFixture({
    'Merged Image Prompt Metadata': registryRows,
    'DMSC Audit Log': [[
      'Timestamp', 'Actor', 'Image Identity ID', 'Action',
      'Field', 'Old Value', 'New Value', 'Source'
    ]]
  });
  const runtime = createAppsScriptRuntime({
    spreadsheet: fixture.spreadsheet,
    activeUserEmail: 'reviewer@example.com'
  });
  const harness = createAppsScriptHarness({ runtime });
  harness.loadFiles([{ path: 'Code.gs', transform: options.transform }]);
  return { harness, fixture, runtime };
}

describe('updateDmscReviewMetadata() production source', () => {
  test('rejects a missing identifier', () => {
    const { harness } = buildHarness();
    const update = harness.getFunction('updateDmscReviewMetadata');

    expect(() => update({ updates: {} })).toThrow('Missing imageIdentityId.');
  });

  test('updates only allowlisted fields and writes production audit evidence', () => {
    const { harness, fixture } = buildHarness();
    const update = harness.getFunction('updateDmscReviewMetadata');

    const result = update({
      imageIdentityId: 'id-001',
      updates: {
        'Human Review Required': 'Yes',
        'Review Reason': 'Needs source review',
        'File ID': 'must-not-change'
      }
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(2);
    expect(result.changes.map((change) => change.field)).toEqual([
      'Human Review Required',
      'Review Reason'
    ]);

    const registry = fixture.spreadsheet.__getSheet('Merged Image Prompt Metadata').__getRows();
    expect(registry[1][1]).toBe('file-001');
    expect(registry[1][3]).toBe('Yes');
    expect(registry[1][4]).toBe('Needs source review');
    expect(registry[1][8]).toBeInstanceOf(Date);

    const audit = fixture.spreadsheet.__getSheet('DMSC Audit Log').__getRows();
    expect(audit).toHaveLength(3);
    expect(audit[1].slice(1)).toEqual([
      'reviewer@example.com',
      'id-001',
      'Human Review Routing Update',
      'Human Review Required',
      'No',
      'Yes',
      'Dashboard UI'
    ]);
  });

  test('does not write or audit when values are unchanged', () => {
    const { harness, fixture } = buildHarness();
    const update = harness.getFunction('updateDmscReviewMetadata');

    const result = update({
      imageIdentityId: 'id-001',
      updates: { 'Human Review Required': 'No' }
    });

    expect(result.changed).toBe(0);
    expect(fixture.spreadsheet.__getSheet('DMSC Audit Log').__getRows()).toHaveLength(1);
  });

  test('fails when the target record does not exist', () => {
    const { harness } = buildHarness();
    const update = harness.getFunction('updateDmscReviewMetadata');

    expect(() => update({ imageIdentityId: 'missing', updates: {} }))
      .toThrow('Record not found for update: missing');
  });

  test('controlled production-source mutation changes the observed behavior', () => {
    const transform = (source) => source.replace(
      "    'Notes',\n    'Metadata Classification Status'",
      "    'Notes MUTATED',\n    'Metadata Classification Status'"
    );
    const { harness, fixture } = buildHarness({ transform });
    const update = harness.getFunction('updateDmscReviewMetadata');

    const result = update({
      imageIdentityId: 'id-001',
      updates: { Notes: 'This would normally be allowed.' }
    });

    expect(result.changed).toBe(0);
    expect(fixture.spreadsheet.__getSheet('Merged Image Prompt Metadata').__getRows()[1][6]).toBe('');
  });
});

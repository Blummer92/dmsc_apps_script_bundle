const fs = require('fs');
const vm = require('vm');

const props = {};
const fakeHeaders = [[
  'Asset ID',
  'Asset title or filename',
  'Drive File ID',
  'Source file link',
  'Source Approval Status',
  'Source Authority Notes'
]];

const fakeRows = fakeHeaders.concat([
  ['A-001', 'Approved Asset', 'drive-1', 'https://drive.google.com/file/d/drive-1/view', 'Approved', ''],
  ['A-002', 'Draft Asset', 'drive-2', 'https://drive.google.com/file/d/drive-2/view', 'Draft', ''],
  ['A-003', 'Missing Drive ID', '', 'Pending Drive upload/folder move', 'Approved', '']
]);

const fakeSheet = {
  getName: () => 'Visual Asset Metadata',
  getLastRow: () => fakeRows.length,
  getLastColumn: () => fakeHeaders[0].length,
  getRange: () => ({ getDisplayValues: () => fakeHeaders }),
  getDataRange: () => ({ getDisplayValues: () => fakeRows })
};

const fakeSpreadsheet = {
  getName: () => 'Visual Asset Metadata',
  getSheetByName: (name) => name === 'Visual Asset Metadata' ? fakeSheet : null
};

const context = {
  Logger: { log: () => {} },
  console,
  SpreadsheetApp: { openById: () => fakeSpreadsheet },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (key) => props[key] || null,
      setProperty: (key, value) => { props[key] = value; }
    })
  }
};

vm.createContext(context);

[
  'VAM_SourceApprovedAudit.gs',
  'VAM_SourceApprovedAuditSmokeTest.gs',
  'VAM_SourceApprovedAuditTests.gs'
].forEach((file) => {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
});

context.runSourceApprovedVisualAssetAuditTests();

let guarded = false;
try {
  context.smokeTestSourceApprovedVisualAssetAudit();
} catch (error) {
  guarded = /Configure VAM_SOURCE_AUDIT_CONFIG\.SPREADSHEET_ID or Script Property/.test(error.message);
}

if (!guarded) {
  throw new Error('Expected smoke test to fail safely before Spreadsheet ID setup.');
}

context.setSourceApprovedAuditSpreadsheetId('test-sheet-id');
const smoke = context.smokeTestSourceApprovedVisualAssetAudit();
const audit = context.runSourceApprovedVisualAssetAudit();

if (!smoke.readyToRunAudit) {
  throw new Error('Smoke test did not report readyToRunAudit.');
}

if (audit.report.totalApprovedRowsFound !== 2) {
  throw new Error('Expected 2 approved rows in local fixture.');
}

if (audit.report.totalApprovedRowsMissingDriveFileId !== 1) {
  throw new Error('Expected 1 missing Drive File ID in local fixture.');
}

if (audit.report.recordsChanged !== false) {
  throw new Error('Audit must report recordsChanged=false.');
}

console.log('Local Codespaces fixture test passed.');

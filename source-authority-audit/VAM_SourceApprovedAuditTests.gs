/**
 * Lightweight tests for the source-approved visual asset audit helpers.
 * Paste this file into the same Apps Script project as the audit module, then
 * run runSourceApprovedVisualAssetAuditTests before running the live audit.
 */

function runSourceApprovedVisualAssetAuditTests() {
  testSourceApprovedAuditFiltersExactApprovedOnly_();
  testSourceApprovedAuditCountsMissingIdentifiers_();
  testSourceApprovedAuditFindsDuplicates_();
  Logger.log('All source-approved visual asset audit tests passed.');
}

function testSourceApprovedAuditFiltersExactApprovedOnly_() {
  const rows = readSourceApprovedAssetRows_(fakeSourceAuditValues_([
    ['A-001', 'Approved Asset', 'drive-1', 'https://drive.google.com/file/d/drive-1/view', 'Approved', ''],
    ['A-002', 'Draft Asset', 'drive-2', 'https://drive.google.com/file/d/drive-2/view', 'Draft', ''],
    ['A-003', 'Lowercase Approved', 'drive-3', 'https://drive.google.com/file/d/drive-3/view', 'approved', '']
  ]));

  assertSourceAuditEquals_(1, rows.length, 'Only exact Approved rows should be included.');
  assertSourceAuditEquals_('A-001', rows[0]['Asset ID'], 'Wrong approved row returned.');
  assertSourceAuditEquals_(2, rows[0]['Row number'], 'Sheet row number should preserve source row position.');
}

function testSourceApprovedAuditCountsMissingIdentifiers_() {
  const rows = readSourceApprovedAssetRows_(fakeSourceAuditValues_([
    ['A-001', 'Complete Asset', 'drive-1', 'https://drive.google.com/file/d/drive-1/view', 'Approved', ''],
    ['', 'Missing Asset ID', 'drive-2', 'https://drive.google.com/file/d/drive-2/view', 'Approved', ''],
    ['A-003', 'Missing Drive ID', '', 'Pending Drive upload/folder move', 'Approved', '']
  ]));
  const report = buildSourceApprovedAuditReport_(rows);

  assertSourceAuditEquals_(3, report.totalApprovedRowsFound, 'Approved row count failed.');
  assertSourceAuditEquals_(2, report.totalApprovedRowsWithAssetId, 'Asset ID present count failed.');
  assertSourceAuditEquals_(1, report.totalApprovedRowsMissingAssetId, 'Missing Asset ID count failed.');
  assertSourceAuditEquals_(1, report.totalApprovedRowsMissingDriveFileId, 'Missing Drive File ID count failed.');
  assertSourceAuditEquals_(1, report.totalApprovedRowsMissingSourceFileLink, 'Missing source file link count failed.');
  assertSourceAuditEquals_(false, report.recordsChanged, 'Audit must report no records changed.');
}

function testSourceApprovedAuditFindsDuplicates_() {
  const rows = readSourceApprovedAssetRows_(fakeSourceAuditValues_([
    ['A-001', 'Asset One', 'drive-1', 'https://drive.google.com/file/d/drive-1/view', 'Approved', ''],
    ['A-001', 'Asset One Duplicate', 'drive-2', 'https://drive.google.com/file/d/drive-2/view', 'Approved', ''],
    ['A-003', 'Drive Duplicate', 'drive-2', 'https://drive.google.com/file/d/drive-2/view', 'Approved', '']
  ]));
  const report = buildSourceApprovedAuditReport_(rows);

  assertSourceAuditEquals_('A-001', report.duplicateAssetIds[0], 'Duplicate Asset ID not reported.');
  assertSourceAuditEquals_('drive-2', report.duplicateDriveFileIds[0], 'Duplicate Drive File ID not reported.');
}

function assertSourceAuditEquals_(expected, actual, message) {
  if (expected !== actual) {
    throw new Error(message + ' Expected [' + expected + '] but got [' + actual + '].');
  }
}

function fakeSourceAuditValues_(rows) {
  return [[
    'Asset ID',
    'Asset title or filename',
    'Drive File ID',
    'Source file link',
    'Source Approval Status',
    'Source Authority Notes'
  ]].concat(rows);
}

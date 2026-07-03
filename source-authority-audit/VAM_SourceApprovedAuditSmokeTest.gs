/**
 * Live read-only smoke test for the source-approved asset audit.
 *
 * Run this after setting VAM_SOURCE_AUDIT_CONFIG.SPREADSHEET_ID and before
 * running runSourceApprovedVisualAssetAudit. It checks the target Sheet, tab,
 * and required headers without writing data or calling Notion.
 */

function smokeTestSourceApprovedVisualAssetAudit() {
  assertSourceAuditConfig_();

  const spreadsheet = SpreadsheetApp.openById(getSourceAuditSpreadsheetId_());
  const sheet = spreadsheet.getSheetByName(VAM_SOURCE_AUDIT_CONFIG.SHEET_NAME);
  if (!sheet) {
    throw new Error('Missing sheet tab: ' + VAM_SOURCE_AUDIT_CONFIG.SHEET_NAME);
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 1 || lastColumn < 1) {
    throw new Error('Sheet is empty: ' + VAM_SOURCE_AUDIT_CONFIG.SHEET_NAME);
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const headerMap = sourceAuditHeaderMap_(headers);
  requireSourceAuditColumns_(headerMap, sourceApprovedRequiredColumns_());

  const result = {
    spreadsheetName: spreadsheet.getName(),
    sheetName: sheet.getName(),
    lastRow: lastRow,
    lastColumn: lastColumn,
    requiredHeadersFound: sourceApprovedRequiredColumns_().join(', '),
    optionalSourceAuthorityNotesFound:
      headerMap[VAM_SOURCE_AUDIT_CONFIG.COLUMNS.sourceAuthorityNotes] !== undefined,
    readyToRunAudit: true,
    recordsChanged: false,
    googleSheetUpdated: 'No',
    notionUpdated: 'No'
  };

  Logger.log('Source-approved visual asset audit smoke test passed:\n%s', JSON.stringify(result, null, 2));
  return result;
}

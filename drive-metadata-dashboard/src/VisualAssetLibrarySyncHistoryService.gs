var VisualAssetLibrarySyncHistoryService = (function() {
  const SHEET_NAME = 'Visual Sync History';
  const HEADERS = [
    'Timestamp',
    'Row',
    'Image',
    'Operation',
    'Changed Fields',
    'Skipped Fields',
    'Reason',
    'Duration Ms',
    'Verification Result',
    'Sync %'
  ];

  function append(entries) {
    const rows = (entries || []).map(function(entry) {
      return [
        entry.timestamp || new Date().toISOString(),
        entry.row || '',
        entry.image || '',
        entry.operation || '',
        (entry.changed_fields || []).join(', '),
        (entry.skipped_fields || []).join(', '),
        entry.reason || '',
        entry.duration_ms || 0,
        entry.verification_result || '',
        entry.sync_percent || 0
      ];
    });
    if (!rows.length) return { appended: 0 };
    const sheet = getSheet_();
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    return { appended: rows.length, sheet: SHEET_NAME };
  }

  function getSheet_() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('Open the bound spreadsheet before writing sync history.');
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#e8f0fe');
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  return { append: append };
})();

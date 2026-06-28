var SheetReadService = (function() {
  function readRecords(spreadsheetId, sheetName, maxRows) {
    if (!spreadsheetId) {
      return readActiveSpreadsheetRecords(sheetName, maxRows);
    }
    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    return readSpreadsheetRecords(spreadsheet, sheetName, maxRows);
  }

  function readConfiguredOrActiveRecords(spreadsheetId, sheetName, maxRows) {
    return spreadsheetId
      ? readRecords(spreadsheetId, sheetName, maxRows)
      : readActiveSpreadsheetRecords(sheetName, maxRows);
  }

  function readActiveSpreadsheetRecords(sheetName, maxRows) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      return { records: [], warnings: ['Active spreadsheet is unavailable. Open the bound spreadsheet and launch the sidebar from the custom menu.'], headers: [] };
    }
    return readSpreadsheetRecords(spreadsheet, sheetName, maxRows);
  }

  function readSpreadsheetRecords(spreadsheet, sheetName, maxRows) {
    if (!spreadsheet) {
      return { records: [], warnings: ['Spreadsheet is unavailable.'], headers: [] };
    }
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return { records: [], warnings: ['Sheet not found: ' + sheetName], headers: [] };
    const lastRow = Math.min(sheet.getLastRow(), maxRows + 1);
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 1 || lastColumn < 1) return { records: [], warnings: ['Sheet is empty: ' + sheetName], headers: [] };
    const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    const headers = values[0].map(normalizeHeader_);
    const records = values.slice(1).filter(rowHasAnyValue_).map(function(row, index) {
      return rowToRecord_(headers, row, index + 2);
    });
    return { records: records, warnings: [], headers: headers };
  }

  function rowToRecord_(headers, row, rowNumber) {
    const record = { rowNumber: rowNumber };
    headers.forEach(function(header, index) {
      if (header) record[header] = formatCellValue_(row[index]);
    });
    return record;
  }

  function rowHasAnyValue_(row) {
    return row.some(function(value) { return String(value || '').trim() !== ''; });
  }

  function normalizeHeader_(header) {
    return String(header || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function formatCellValue_(value) {
    if (value instanceof Date) return value.toISOString();
    if (value === null || typeof value === 'undefined') return '';
    return String(value);
  }

  return {
    readRecords: readRecords,
    readConfiguredOrActiveRecords: readConfiguredOrActiveRecords,
    readActiveSpreadsheetRecords: readActiveSpreadsheetRecords,
    readSpreadsheetRecords: readSpreadsheetRecords
  };
})();

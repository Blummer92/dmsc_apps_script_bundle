var SheetReadService = (function() {
  function readRecords(spreadsheetId, sheetName, maxRows) {
    if (!spreadsheetId) {
      return readActiveSpreadsheetRecords(sheetName, maxRows);
    }

    return readSpreadsheetRecordsById(spreadsheetId, sheetName, maxRows);
  }

  function readConfiguredOrActiveRecords(spreadsheetId, sheetName, maxRows) {
    return spreadsheetId
      ? readRecords(spreadsheetId, sheetName, maxRows)
      : readActiveSpreadsheetRecords(sheetName, maxRows);
  }

  function readActiveSpreadsheetRecords(sheetName, maxRows) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      return {
        records: [],
        warnings: ['Active spreadsheet is unavailable. Open the bound spreadsheet and launch the sidebar from the custom menu.'],
        headers: []
      };
    }
    return readSpreadsheetRecords(spreadsheet, sheetName, maxRows);
  }

  function readSpreadsheetRecordsById(spreadsheetId, sheetName, maxRows) {
    const rowLimit = Math.max(1, Number(maxRows || 0) + 1);
    return readSpreadsheetRowsById(spreadsheetId, sheetName, 2, rowLimit);
  }

  function readSpreadsheetRowsById(spreadsheetId, sheetName, startRow, endRow) {
    if (!spreadsheetId) {
      return {
        records: [],
        warnings: ['Spreadsheet ID is unavailable.'],
        headers: []
      };
    }

    if (!sheetName) {
      return {
        records: [],
        warnings: ['Sheet name is unavailable.'],
        headers: []
      };
    }

    ensureSheetsApi_();

    const firstDataRow = Math.max(2, Number(startRow || 2));
    const lastDataRow = Math.max(firstDataRow, Number(endRow || firstDataRow));
    const range = quoteSheetName_(sheetName) + '!1:' + lastDataRow;
    const response = Sheets.Spreadsheets.Values.get(spreadsheetId, range, {
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
      majorDimension: 'ROWS'
    });
    const values = response.values || [];
    const result = valuesToRecords_(values, sheetName);
    result.records = result.records.filter(function(record) {
      return record.rowNumber >= firstDataRow && record.rowNumber <= lastDataRow;
    });
    return result;
  }

  function getActiveSheetName() {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      return '';
    }
    const sheet = spreadsheet.getActiveSheet();
    return sheet ? sheet.getName() : '';
  }

  function readSpreadsheetRecords(spreadsheet, sheetName, maxRows) {
    if (!spreadsheet) {
      return {
        records: [],
        warnings: ['Spreadsheet is unavailable.'],
        headers: []
      };
    }

    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      return {
        records: [],
        warnings: ['Sheet not found: ' + sheetName],
        headers: []
      };
    }

    const lastRow = Math.min(sheet.getLastRow(), maxRows + 1);
    const lastColumn = sheet.getLastColumn();
    if (lastRow < 1 || lastColumn < 1) {
      return {
        records: [],
        warnings: ['Sheet is empty: ' + sheetName],
        headers: []
      };
    }

    const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
    return valuesToRecords_(values, sheetName);
  }

  function valuesToRecords_(values, sheetName) {
    if (!values.length || !values[0] || !values[0].length) {
      return {
        records: [],
        warnings: ['Sheet is empty: ' + sheetName],
        headers: []
      };
    }

    const headers = values[0].map(normalizeHeader_);
    const records = values
      .slice(1)
      .filter(rowHasAnyValue_)
      .map(function(row, index) {
        return rowToRecord_(headers, row, index + 2);
      });

    return {
      records: records,
      warnings: [],
      headers: headers
    };
  }

  function rowToRecord_(headers, row, rowNumber) {
    const record = {
      rowNumber: rowNumber
    };

    headers.forEach(function(header, index) {
      if (header) {
        record[header] = formatCellValue_(row[index]);
      }
    });

    return record;
  }

  function rowHasAnyValue_(row) {
    return row.some(function(value) {
      return String(value || '').trim() !== '';
    });
  }

  function normalizeHeader_(header) {
    return String(header || '')
      .toLowerCase()
      .trim()
      .replace(/[\/]+/g, ' ')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function quoteSheetName_(sheetName) {
    return "'" + String(sheetName || '').replace(/'/g, "''") + "'";
  }

  function ensureSheetsApi_() {
    if (typeof Sheets === 'undefined' || !Sheets.Spreadsheets || !Sheets.Spreadsheets.Values) {
      throw new Error('Blocked: Google Sheets advanced service is not enabled. Enable the Sheets API advanced service and keep the spreadsheets.readonly scope.');
    }
  }

  function formatCellValue_(value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value === null || typeof value === 'undefined') {
      return '';
    }
    return String(value);
  }

  return {
    readRecords: readRecords,
    readConfiguredOrActiveRecords: readConfiguredOrActiveRecords,
    readActiveSpreadsheetRecords: readActiveSpreadsheetRecords,
    readSpreadsheetRecords: readSpreadsheetRecords,
    readSpreadsheetRecordsById: readSpreadsheetRecordsById,
    readSpreadsheetRowsById: readSpreadsheetRowsById,
    getActiveSheetName: getActiveSheetName
  };
})();

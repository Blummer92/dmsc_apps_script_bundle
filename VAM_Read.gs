function vamReadAssetRows_() {
  vamLog_('READ_START', {
    spreadsheetId: VAM_GOV_CONFIG.spreadsheetId,
    assetSheetName: VAM_GOV_CONFIG.assetSheetName
  });
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(VAM_GOV_CONFIG.assetSheetName);
  if (!sheet) throw new Error('Missing asset sheet: ' + VAM_GOV_CONFIG.assetSheetName);

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  const headers = lastColumn
    ? sheet.getRange(VAM_GOV_CONFIG.headerRow, 1, 1, lastColumn).getDisplayValues()[0].map(vamClean_)
    : [];
  const headerMap = vamBuildHeaderMap_(headers);
  vamLog_('READ_HEADERS', {
    lastRow: lastRow,
    lastColumn: lastColumn,
    headerCount: headers.filter(Boolean).length,
    firstTenHeaders: headers.slice(0, 10).join(' | ')
  });

  if (lastRow < VAM_GOV_CONFIG.firstDataRow || lastColumn < 1) {
    vamLog_('READ_COMPLETE_EMPTY', {
      records: 0
    });
    return { sheet: sheet, headers: headers, headerMap: headerMap, records: [] };
  }

  const rows = sheet
    .getRange(VAM_GOV_CONFIG.firstDataRow, 1, lastRow - VAM_GOV_CONFIG.firstDataRow + 1, lastColumn)
    .getValues();
  const records = rows
    .map(function(row, index) {
      return {
        rowNumber: VAM_GOV_CONFIG.firstDataRow + index,
        row: row,
        values: vamRowToObject_(headers, row)
      };
    })
    .filter(function(record) {
      return record.row.some(function(value) { return vamClean_(value) !== ''; });
    });

  vamLog_('READ_COMPLETE', {
    rawDataRows: rows.length,
    nonEmptyRecords: records.length,
    firstDataRow: VAM_GOV_CONFIG.firstDataRow,
    lastDataRow: lastRow
  });
  return { sheet: sheet, headers: headers, headerMap: headerMap, records: records };
}

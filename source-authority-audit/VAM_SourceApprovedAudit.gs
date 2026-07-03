/**
 * Verification-only audit for source-approved visual assets.
 *
 * This module reads the Visual Asset Metadata sheet, filters rows where
 * Source Approval Status exactly equals Approved, and returns a report plus
 * a sync-ready list. It does not update Notion, the Google Sheet, or Drive.
 */

const VAM_SOURCE_AUDIT_CONFIG = {
  SPREADSHEET_ID: 'PASTE_VISUAL_ASSET_METADATA_SPREADSHEET_ID',
  SPREADSHEET_ID_PROPERTY_KEY: 'VAM_SOURCE_AUDIT_SPREADSHEET_ID',
  SHEET_NAME: 'Visual Asset Metadata',
  APPROVED_STATUS: 'Approved',
  COLUMNS: {
    approvalStatus: 'Source Approval Status',
    assetId: 'Asset ID',
    title: 'Asset title or filename',
    driveFileId: 'Drive File ID',
    sourceFileLink: 'Source file link',
    sourceAuthorityNotes: 'Source Authority Notes'
  }
};

/**
 * Main test entrypoint.
 * Returns { report, rows, csv, reportCsv } and writes no data anywhere.
 */
function runSourceApprovedVisualAssetAudit() {
  assertSourceAuditConfig_();

  const sheet = SpreadsheetApp.openById(getSourceAuditSpreadsheetId_())
    .getSheetByName(VAM_SOURCE_AUDIT_CONFIG.SHEET_NAME);
  if (!sheet) {
    throw new Error('Missing sheet: ' + VAM_SOURCE_AUDIT_CONFIG.SHEET_NAME);
  }

  const rows = readSourceApprovedAssetRows_(sheet.getDataRange().getDisplayValues());
  const report = buildSourceApprovedAuditReport_(rows);
  const csv = sourceAuditToCsv_(rows, sourceApprovedAuditHeaders_());
  const reportCsv = sourceAuditToCsv_(sourceApprovedAuditReportRows_(report), ['Metric', 'Value']);

  Logger.log('Source-approved visual asset audit report\n%s', reportCsv);
  Logger.log('Source-approved visual asset sync-ready list\n%s', csv);

  return {
    report: report,
    rows: rows,
    csv: csv,
    reportCsv: reportCsv
  };
}

/**
 * Optional setup helper for testing.
 * This stores only the source Spreadsheet ID in Script Properties. It does
 * not update the Google Sheet, Notion, or Drive files.
 */
function setSourceApprovedAuditSpreadsheetId(spreadsheetId) {
  const id = String(spreadsheetId || '').trim();
  if (!id) {
    throw new Error('Provide a non-empty Spreadsheet ID.');
  }

  PropertiesService.getScriptProperties().setProperty(
    VAM_SOURCE_AUDIT_CONFIG.SPREADSHEET_ID_PROPERTY_KEY,
    id
  );
  Logger.log('Saved source audit Spreadsheet ID in Script Properties.');
}

function readSourceApprovedAssetRows_(values) {
  if (!values || values.length < 2) {
    return [];
  }

  const headerMap = sourceAuditHeaderMap_(values[0]);
  requireSourceAuditColumns_(headerMap, sourceApprovedRequiredColumns_());

  return values.slice(1).map(function(row, index) {
    return toSourceApprovedAssetRow_(row, headerMap, index + 2);
  }).filter(function(row) {
    return row['Source Approval Status'] === VAM_SOURCE_AUDIT_CONFIG.APPROVED_STATUS;
  });
}

function toSourceApprovedAssetRow_(row, headerMap, rowNumber) {
  const columns = VAM_SOURCE_AUDIT_CONFIG.COLUMNS;
  return {
    'Row number': rowNumber,
    'Asset ID': sourceAuditCell_(row, headerMap, columns.assetId),
    'Asset title or filename': sourceAuditCell_(row, headerMap, columns.title),
    'Drive File ID': normalizeSourceAuditDriveFileId_(sourceAuditCell_(row, headerMap, columns.driveFileId)),
    'Source file link': sourceAuditCell_(row, headerMap, columns.sourceFileLink),
    'Source Approval Status': sourceAuditCell_(row, headerMap, columns.approvalStatus),
    'Source Authority Notes': sourceAuditCell_(row, headerMap, columns.sourceAuthorityNotes)
  };
}

function sourceApprovedRequiredColumns_() {
  const columns = VAM_SOURCE_AUDIT_CONFIG.COLUMNS;
  return [
    columns.approvalStatus,
    columns.assetId,
    columns.title,
    columns.driveFileId,
    columns.sourceFileLink
  ];
}

function buildSourceApprovedAuditReport_(rows) {
  const missingAssetId = rows.filter(function(row) {
    return !row['Asset ID'];
  });
  const missingDriveFileId = rows.filter(function(row) {
    return !row['Drive File ID'];
  });
  const missingSourceFileLink = rows.filter(function(row) {
    return !isSourceAuditUsableUrl_(row['Source file link']);
  });

  return {
    totalApprovedRowsFound: rows.length,
    totalApprovedRowsWithAssetId: rows.length - missingAssetId.length,
    totalApprovedRowsMissingAssetId: missingAssetId.length,
    totalApprovedRowsMissingDriveFileId: missingDriveFileId.length,
    totalApprovedRowsMissingSourceFileLink: missingSourceFileLink.length,
    duplicateAssetIds: duplicateValues_(rows.map(function(row) {
      return row['Asset ID'];
    })),
    duplicateDriveFileIds: duplicateValues_(rows.map(function(row) {
      return row['Drive File ID'];
    })),
    recordsChanged: false,
    googleSheetUpdated: 'No',
    notionUpdated: 'No'
  };
}

function sourceApprovedAuditReportRows_(report) {
  return [
    { Metric: 'total_approved_rows_found', Value: report.totalApprovedRowsFound },
    { Metric: 'total_approved_rows_with_asset_id', Value: report.totalApprovedRowsWithAssetId },
    { Metric: 'total_approved_rows_missing_asset_id', Value: report.totalApprovedRowsMissingAssetId },
    { Metric: 'total_approved_rows_missing_drive_file_id', Value: report.totalApprovedRowsMissingDriveFileId },
    { Metric: 'total_approved_rows_missing_source_file_link', Value: report.totalApprovedRowsMissingSourceFileLink },
    { Metric: 'duplicate_asset_ids', Value: report.duplicateAssetIds.join(', ') || 'None' },
    { Metric: 'duplicate_drive_file_ids', Value: report.duplicateDriveFileIds.join(', ') || 'None' },
    { Metric: 'records_changed', Value: report.recordsChanged ? 'Yes' : 'No' },
    { Metric: 'google_sheet_updated', Value: report.googleSheetUpdated },
    { Metric: 'notion_updated', Value: report.notionUpdated }
  ];
}

function sourceApprovedAuditHeaders_() {
  return [
    'Row number',
    'Asset ID',
    'Asset title or filename',
    'Drive File ID',
    'Source file link',
    'Source Approval Status',
    'Source Authority Notes'
  ];
}

function duplicateValues_(values) {
  const counts = {};
  values.map(function(value) {
    return String(value || '').trim();
  }).filter(Boolean).forEach(function(value) {
    counts[value] = (counts[value] || 0) + 1;
  });

  return Object.keys(counts).filter(function(value) {
    return counts[value] > 1;
  }).sort();
}

function sourceAuditHeaderMap_(headers) {
  return headers.reduce(function(map, header, index) {
    map[String(header).trim()] = index;
    return map;
  }, {});
}

function requireSourceAuditColumns_(headerMap, columns) {
  const missing = columns.filter(function(column) {
    return headerMap[column] === undefined;
  });
  if (missing.length) {
    throw new Error('Missing required source columns: ' + missing.join(', '));
  }
}

function sourceAuditCell_(row, headerMap, columnName) {
  const index = headerMap[columnName];
  if (index === undefined) {
    return '';
  }
  return String(row[index] || '').trim();
}

function normalizeSourceAuditDriveFileId_(value) {
  return String(value || '').trim();
}

function sourceAuditToCsv_(rows, headers) {
  const lines = [headers.join(',')];
  rows.forEach(function(row) {
    lines.push(headers.map(function(header) {
      return sourceAuditCsvCell_(row[header]);
    }).join(','));
  });
  return lines.join('\n');
}

function sourceAuditCsvCell_(value) {
  const text = String(value === undefined || value === null ? '' : value);
  if (/[",\n\r]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function isSourceAuditUsableUrl_(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function assertSourceAuditConfig_() {
  const spreadsheetId = getSourceAuditSpreadsheetId_();
  if (
    !spreadsheetId ||
    spreadsheetId.indexOf('PASTE_') === 0
  ) {
    throw new Error(
      'Configure VAM_SOURCE_AUDIT_CONFIG.SPREADSHEET_ID or Script Property ' +
      VAM_SOURCE_AUDIT_CONFIG.SPREADSHEET_ID_PROPERTY_KEY +
      ' before running.'
    );
  }
}

function getSourceAuditSpreadsheetId_() {
  const configuredId = String(VAM_SOURCE_AUDIT_CONFIG.SPREADSHEET_ID || '').trim();
  if (configuredId && configuredId.indexOf('PASTE_') !== 0) {
    return configuredId;
  }

  return String(
    PropertiesService.getScriptProperties()
      .getProperty(VAM_SOURCE_AUDIT_CONFIG.SPREADSHEET_ID_PROPERTY_KEY) || ''
  ).trim();
}

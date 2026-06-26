function getDb_(spreadsheetId) {
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function setupDashboard(spreadsheetId) {
  const ss = getDb_(spreadsheetId);
  ensureSheet_(ss, APP_CONFIG.SHEETS.PROJECTS, PROJECT_HEADERS);
  ensureSheet_(ss, APP_CONFIG.SHEETS.LOGS, LOG_HEADERS);
  ensureSheet_(ss, APP_CONFIG.SHEETS.HANDOFFS, HANDOFF_HEADERS);
  ensureSheet_(ss, APP_CONFIG.SHEETS.CHANGES, CHANGE_HEADERS);
  ensureSheet_(ss, APP_CONFIG.SHEETS.CONTRACTS, CONTRACT_HEADERS);
  seedContracts_(ss);
  return getDashboardSummary(spreadsheetId);
}

function ensureSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const existing = headerRange.getValues()[0];
  const hasHeaders = existing.some(function(value) { return String(value).trim(); });

  if (!hasHeaders) {
    headerRange.setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendRecord_(sheetName, headers, record) {
  const ss = getDb_();
  const sheet = ensureSheet_(ss, sheetName, headers);
  const row = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(record, header) ? record[header] : '';
  });
  sheet.appendRow(row);
  return record;
}

function getDashboardSummary(spreadsheetId) {
  const ss = getDb_(spreadsheetId);
  return {
    app: APP_CONFIG.APP_NAME,
    version: APP_CONFIG.VERSION,
    sheets: APPROVED_SHEETS.map(function(name) {
      const sheet = ss.getSheetByName(name);
      return {
        name: name,
        exists: Boolean(sheet),
        records: sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0
      };
    })
  };
}

function seedContracts_(ss) {
  const sheet = ensureSheet_(ss, APP_CONFIG.SHEETS.CONTRACTS, CONTRACT_HEADERS);
  if (sheet.getLastRow() > 1) return;

  const now = new Date().toISOString();
  const rows = [
    ['CONTRACT-project-id', 'project_id', 'canonical', 'Apps Script Projects', 'All dashboard modules', 'Write allowed for Apps Script operations', false, 'Stable project key', now],
    ['CONTRACT-source-doc', 'source_document_relation', 'relation', 'External source record', 'Apps Script Projects', 'Reference only', true, 'Do not treat as approval', now],
    ['CONTRACT-readiness', 'curriculum_readiness_lookup', 'lookup', 'External readiness owner', 'Apps Script Projects', 'Read-only summary', true, 'No write-back from this dashboard', now]
  ];
  sheet.getRange(2, 1, rows.length, CONTRACT_HEADERS.length).setValues(rows);
}

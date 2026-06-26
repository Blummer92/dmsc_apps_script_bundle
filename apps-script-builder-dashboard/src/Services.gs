function getDashboardSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty(APP_CONFIG.PROPERTY_KEYS.SPREADSHEET_ID);

  if (!spreadsheetId) {
    throw new Error('Missing dashboard spreadsheet ID. Run setupDashboard(spreadsheetId) first.');
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function setupDashboard(spreadsheetId) {
  if (!spreadsheetId) {
    throw new Error('setupDashboard requires a Google Sheets spreadsheet ID.');
  }

  PropertiesService.getScriptProperties()
    .setProperty(APP_CONFIG.PROPERTY_KEYS.SPREADSHEET_ID, spreadsheetId);
  if (!PropertiesService.getScriptProperties().getProperty(APP_CONFIG.PROPERTY_KEYS.SYNC_MODE)) {
    PropertiesService.getScriptProperties()
      .setProperty(APP_CONFIG.PROPERTY_KEYS.SYNC_MODE, APP_CONFIG.SYNC_MODES.MOCK);
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  ensureSchema_(spreadsheet);
  seedFieldContract_(spreadsheet);

  logChange({
    project_id: '',
    change_type: 'schema_setup',
    changed_field: 'dashboard_schema',
    previous_value: '',
    new_value: APP_CONFIG.SCHEMA_VERSION,
    reason: 'Initial approved schema setup.',
    changed_by_agent: 'Google Apps Script Builder Agent',
    requires_owner_review: false,
  });

  return getDashboardSummary();
}

function ensureSchema_(spreadsheet) {
  const sheetMap = {
    [APP_CONFIG.SHEETS.PROJECTS]: DASHBOARD_SCHEMA.PROJECTS,
    [APP_CONFIG.SHEETS.PROJECT_LOGS]: DASHBOARD_SCHEMA.PROJECT_LOGS,
    [APP_CONFIG.SHEETS.HANDOFF_RECORDS]: DASHBOARD_SCHEMA.HANDOFF_RECORDS,
    [APP_CONFIG.SHEETS.CHANGE_LOG]: DASHBOARD_SCHEMA.CHANGE_LOG,
    [APP_CONFIG.SHEETS.AGENT_DATA_CONTRACTS]: DASHBOARD_SCHEMA.AGENT_DATA_CONTRACTS,
  };

  Object.keys(sheetMap).forEach((sheetName) => {
    const sheet = getOrCreateSheet_(spreadsheet, sheetName);
    writeHeader_(sheet, sheetMap[sheetName]);
  });
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function writeHeader_(sheet, headers) {
  const existingLastColumn = Math.max(sheet.getLastColumn(), headers.length);
  const existing = sheet.getRange(1, 1, 1, existingLastColumn).getValues()[0];
  const needsUpdate = headers.some((header, index) => existing[index] !== header);

  if (!needsUpdate && existing.length === headers.length) {
    return;
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function seedFieldContract_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(APP_CONFIG.SHEETS.AGENT_DATA_CONTRACTS);
  const headers = DASHBOARD_SCHEMA.AGENT_DATA_CONTRACTS;
  const existingValues = sheet.getDataRange().getValues();
  const existingFields = new Set(existingValues.slice(1).map((row) => row[1]).filter(String));
  const now = nowIso_();

  const rows = FIELD_CONTRACT
    .filter((contract) => !existingFields.has(contract.field_name))
    .map((contract) => rowFromObject_(headers, {
      contract_id: makeId_('contract'),
      field_name: contract.field_name,
      classification: contract.classification,
      owner_database: contract.owner_database,
      consuming_database: contract.consuming_database,
      safe_sync_rule: contract.safe_sync_rule,
      blocked_until_owner_review: contract.blocked_until_owner_review,
      notes: '',
      updated_at: now,
    }));

  appendRows_(sheet, rows);
}

function createProject(project) {
  const cleanProject = validateProjectInput_(project);
  assertNoAuthorityWrites_(cleanProject);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const spreadsheet = getDashboardSpreadsheet_();
    const sheet = spreadsheet.getSheetByName(APP_CONFIG.SHEETS.PROJECTS);
    const headers = DASHBOARD_SCHEMA.PROJECTS;
    const now = nowIso_();
    const projectId = cleanProject.project_id || makeId_('project');

    const row = rowFromObject_(headers, Object.assign({}, cleanProject, {
      project_id: projectId,
      last_synced_at: cleanProject.last_synced_at || '',
      build_status: cleanProject.build_status || 'intake',
      deployment_status: cleanProject.deployment_status || 'not_deployed',
      project_risk_level: cleanProject.project_risk_level || APP_CONFIG.RISK_LEVELS.LOW,
      created_at: now,
      updated_at: now,
    }));

    appendRows_(sheet, [row]);
    logDecision(projectId, 'Project created with approved Apps Script operational metadata only.');

    return { project_id: projectId, status: 'created' };
  } finally {
    lock.releaseLock();
  }
}

function getDashboardSummary() {
  const spreadsheet = getDashboardSpreadsheet_();
  return {
    app_name: APP_CONFIG.APP_NAME,
    schema_version: APP_CONFIG.SCHEMA_VERSION,
    sheets: Object.values(APP_CONFIG.SHEETS).map((sheetName) => {
      const sheet = spreadsheet.getSheetByName(sheetName);
      return {
        name: sheetName,
        records: sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0,
      };
    }),
  };
}

function appendRows_(sheet, rows) {
  if (!rows.length) {
    return;
  }

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

function rowFromObject_(headers, value) {
  return headers.map((header) => value[header] === undefined ? '' : value[header]);
}

function makeId_(prefix) {
  return `${prefix}_${Utilities.getUuid()}`;
}

function nowIso_() {
  return Utilities.formatDate(new Date(), APP_CONFIG.PROJECT_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

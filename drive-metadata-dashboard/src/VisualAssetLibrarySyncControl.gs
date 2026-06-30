function runVisualAssetLibrarySyncBatch(mode) {
  const requestedMode = normalizeVisualSyncMode_(mode);
  const action = requestedMode === 'STAGING_WRITE' ? 'SYNC' : 'DRY_RUN';
  return VisualAssetLibrarySyncManagerService.run(action, 'current_batch');
}

function advanceVisualAssetLibrarySyncBatch() {
  return VisualAssetLibrarySyncManagerService.run('NEXT', 'current_batch').manager.status;
}

function resetVisualAssetLibrarySyncCursor() {
  const props = PropertiesService.getScriptProperties();
  const startRow = Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2);
  props.setProperty('DM_NOTION_SYNC_CURSOR_ROW', String(startRow));
  return Object.assign({}, getVisualAssetLibrarySyncPanel(), {
    reset: true,
    message: 'Reset to the first configured batch.'
  });
}

function selectVisualAssetLibrarySourceRow(rowNumber) {
  const config = getRuntimeConfig();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Open the bound spreadsheet before selecting a source row.');
  }
  const sheet = spreadsheet.getSheetByName(config.sourceLibrarySheetName);
  if (!sheet) {
    throw new Error('Source library sheet not found: ' + config.sourceLibrarySheetName);
  }
  const row = Math.max(2, Number(rowNumber || 2));
  spreadsheet.setActiveSheet(sheet);
  sheet.setActiveRange(sheet.getRange(row, 1, 1, Math.max(1, sheet.getLastColumn())));
  return { ok: true, row: row, sheet: sheet.getName() };
}

function normalizeVisualSyncMode_(mode) {
  const value = String(mode || 'DRY_RUN').toUpperCase().trim();
  if (value === 'DRY_RUN' || value === 'STAGING_WRITE') {
    return value;
  }
  throw new Error('Blocked: unsupported sync mode ' + mode + '. Use DRY_RUN or STAGING_WRITE.');
}

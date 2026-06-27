var APP_CONFIG = Object.freeze({
  APP_NAME: 'Drive Metadata Dashboard',
  MENU_NAME: 'Drive Metadata',
  SIDEBAR_TITLE: 'Drive Metadata Dashboard',
  DEFAULT_METADATA_SHEET_NAME: 'Drive Images',
  DEFAULT_SOURCE_LIBRARY_SHEET_NAME: 'DM Source Library',
  DEFAULT_RESULT_LIMIT: 250,
  MAX_ROWS_TO_READ: 1000,
  PROPERTIES: Object.freeze({
    DASHBOARD_SPREADSHEET_ID: 'DRIVE_METADATA_DASHBOARD_SPREADSHEET_ID',
    METADATA_SHEET_NAME: 'DRIVE_METADATA_SHEET_NAME',
    SOURCE_LIBRARY_SPREADSHEET_ID: 'DM_SOURCE_LIBRARY_SPREADSHEET_ID',
    SOURCE_LIBRARY_SHEET_NAME: 'DM_SOURCE_LIBRARY_SHEET_NAME',
    RESULT_LIMIT: 'DRIVE_METADATA_RESULT_LIMIT'
  })
});

function getRuntimeConfig() {
  const properties = PropertiesService.getScriptProperties();
  const configuredLimit = Number(properties.getProperty(APP_CONFIG.PROPERTIES.RESULT_LIMIT));
  const configuredDashboardId = properties.getProperty(APP_CONFIG.PROPERTIES.DASHBOARD_SPREADSHEET_ID);
  return {
    dashboardSpreadsheetId: configuredDashboardId || getActiveSpreadsheetId_(),
    metadataSheetName: properties.getProperty(APP_CONFIG.PROPERTIES.METADATA_SHEET_NAME) || APP_CONFIG.DEFAULT_METADATA_SHEET_NAME,
    sourceLibrarySpreadsheetId: properties.getProperty(APP_CONFIG.PROPERTIES.SOURCE_LIBRARY_SPREADSHEET_ID) || '',
    sourceLibrarySheetName: properties.getProperty(APP_CONFIG.PROPERTIES.SOURCE_LIBRARY_SHEET_NAME) || APP_CONFIG.DEFAULT_SOURCE_LIBRARY_SHEET_NAME,
    resultLimit: Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : APP_CONFIG.DEFAULT_RESULT_LIMIT
  };
}

function getExpectedFields() {
  return {
    FILE_NAME: 'file_name',
    FULL_PATH: 'full_path',
    FILE_ID: 'file_id',
    DRIVE_URL: 'drive_url',
    REVIEW_TIER: 'review_tier',
    SOURCE_APPROVAL_STATUS: 'source_approval_status',
    SOURCE_APPROVAL_EVIDENCE_URL: 'source_approval_evidence_url',
    APPROVED_PROMPT: 'approved_prompt',
    DUPLICATE_RESOLUTION_STATUS: 'duplicate_resolution_status'
  };
}

function getActiveSpreadsheetId_() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    return spreadsheet ? spreadsheet.getId() : '';
  } catch (error) {
    console.warn('Unable to read active spreadsheet ID.', { message: error.message });
    return '';
  }
}

/**
 * Shared read-only service helpers for the existing Apps Script project.
 */
function getRegistrySpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty(CONFIG.PROPERTY_KEYS.REGISTRY_SPREADSHEET_ID);

  if (!spreadsheetId) {
    throw new Error(
      `Missing Script Property: ${CONFIG.PROPERTY_KEYS.REGISTRY_SPREADSHEET_ID}`
    );
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getRegistrySheet_() {
  const spreadsheet = getRegistrySpreadsheet_();
  const sheet = spreadsheet.getSheetByName(CONFIG.SHEETS.REGISTRY);

  if (!sheet) {
    throw new Error(`Missing sheet tab: ${CONFIG.SHEETS.REGISTRY}`);
  }

  return sheet;
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

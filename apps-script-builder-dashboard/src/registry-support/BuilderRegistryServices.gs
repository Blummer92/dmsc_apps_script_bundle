/**
 * Shared read-only helpers for the Builder Registry module.
 */
function getBuilderRegistrySpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty(BUILDER_REGISTRY_CONFIG.PROPERTY_KEYS.REGISTRY_SPREADSHEET_ID);

  if (!spreadsheetId) {
    throw new Error(
      `Missing Script Property: ${BUILDER_REGISTRY_CONFIG.PROPERTY_KEYS.REGISTRY_SPREADSHEET_ID}`
    );
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getBuilderRegistrySheet_() {
  const spreadsheet = getBuilderRegistrySpreadsheet_();
  const sheet = spreadsheet.getSheetByName(BUILDER_REGISTRY_CONFIG.SHEETS.REGISTRY);

  if (!sheet) {
    throw new Error(`Missing registry sheet: ${BUILDER_REGISTRY_CONFIG.SHEETS.REGISTRY}`);
  }

  return sheet;
}

function builderRegistryInclude_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

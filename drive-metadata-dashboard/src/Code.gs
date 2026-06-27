function onOpen() {
  const ui = getSpreadsheetUi_('onOpen');
  if (!ui) {
    return;
  }

  ui
    .createMenu(APP_CONFIG.MENU_NAME)
    .addItem('Open Dashboard', 'showDriveMetadataSidebar')
    .addToUi();
}

function showDriveMetadataSidebar() {
  const ui = getSpreadsheetUi_('showDriveMetadataSidebar');
  if (!ui) {
    return {
      ok: false,
      message: 'Open the bound spreadsheet and use Drive Metadata > Open Dashboard. Sidebars cannot be opened from the Apps Script editor execution context.'
    };
  }

  const html = HtmlService
    .createTemplateFromFile('src/Ui')
    .evaluate()
    .setTitle(APP_CONFIG.SIDEBAR_TITLE);

  ui.showSidebar(html);
  return { ok: true };
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getDashboardBootstrap() {
  const config = getRuntimeConfig();
  return {
    appName: APP_CONFIG.APP_NAME,
    readOnly: true,
    tabs: ['Scan', 'Review', 'Validation', 'Source Approval Summary', 'Handoff'],
    expectedFields: getExpectedFields(),
    configStatus: {
      hasDashboardSpreadsheet: Boolean(config.dashboardSpreadsheetId),
      metadataSheetName: config.metadataSheetName,
      hasSourceLibrarySpreadsheet: Boolean(config.sourceLibrarySpreadsheetId),
      sourceLibrarySheetName: config.sourceLibrarySheetName,
      resultLimit: config.resultLimit
    }
  };
}

function getDriveMetadataDashboard() {
  return DriveMetadataDashboardService.buildDashboard();
}

function getSpreadsheetUi_(caller) {
  try {
    return SpreadsheetApp.getUi();
  } catch (error) {
    console.warn(caller + ' skipped because spreadsheet UI is unavailable in this execution context.', {
      message: error.message
    });
    return null;
  }
}

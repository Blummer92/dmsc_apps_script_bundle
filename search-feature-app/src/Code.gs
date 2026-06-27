function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(APP_CONFIG.MENU_NAME)
    .addItem('Open Search', 'showSearchSidebar')
    .addToUi();
}

function showSearchSidebar() {
  const html = HtmlService
    .createTemplateFromFile('src/Ui')
    .evaluate()
    .setTitle(APP_CONFIG.SIDEBAR_TITLE);

  SpreadsheetApp.getUi().showSidebar(html);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile('src/' + filename).getContent();
}

function getSearchBootstrap() {
  const config = getRuntimeConfig();

  return {
    appName: APP_CONFIG.APP_NAME,
    fields: getMetadataFields(),
    configStatus: {
      hasIndexSpreadsheet: Boolean(config.indexSpreadsheetId),
      indexSheetName: config.indexSheetName,
      enableDriveSearch: config.enableDriveSearch,
      hasDriveFolders: config.driveFolderIds.length > 0,
      readinessVocabulary: config.readinessVocabulary,
      resultLimit: config.resultLimit
    }
  };
}

function searchCurriculum(query, filters) {
  return CurriculumSearchService.search(query, filters || {});
}

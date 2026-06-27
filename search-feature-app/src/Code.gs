function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(CONFIG.menuName)
    .addItem('Open Search', 'showSearchSidebar')
    .addToUi();
}

function showSearchSidebar() {
  const html = HtmlService.createTemplateFromFile('Ui')
    .evaluate()
    .setTitle(CONFIG.sidebarTitle);
  SpreadsheetApp.getUi().showSidebar(html);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSearchBootstrap() {
  return {
    config: getRuntimeConfig(),
    fields: getMetadataFields()
  };
}

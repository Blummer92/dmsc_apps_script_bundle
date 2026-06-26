function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Builder Dashboard')
    .addItem('Open Dashboard', 'showDashboardSidebar')
    .addItem('Check Schema', 'showSchemaSummary')
    .addToUi();
}

function showDashboardSidebar() {
  const html = HtmlService.createTemplateFromFile('Ui')
    .evaluate()
    .setTitle(APP_CONFIG.APP_NAME);
  SpreadsheetApp.getUi().showSidebar(html);
}

function showSchemaSummary() {
  const summary = getDashboardSummary();
  SpreadsheetApp.getUi().alert(JSON.stringify(summary, null, 2));
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getClientDashboardSummary() {
  const startedAt = Date.now();
  const summary = getDashboardSummary();
  logPerformance('system_dashboard', 'getClientDashboardSummary', Date.now() - startedAt, {
    record_count: summary.sheets.reduce(function(total, sheet) {
      return total + sheet.records;
    }, 0),
    cache_status: 'not_used'
  });
  return summary;
}

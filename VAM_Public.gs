function runVisualAssetValidationDashboard() {
  const startedAt = new Date();
  vamStartRun_();
  vamVisibleLog_('START runVisualAssetValidationDashboard');
  vamLogEngineerPromptForFixes_();
  vamLog_('RUN_START', {
    spreadsheetId: VAM_GOV_CONFIG.spreadsheetId,
    assetSheetName: VAM_GOV_CONFIG.assetSheetName,
    dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName
  });
  const report = buildVisualAssetValidationReport();
  vamLog_('REPORT_READY', report.summary);
  vamWriteValidationDashboard_(report);
  vamLog_('RUN_COMPLETE', {
    durationMs: new Date().getTime() - startedAt.getTime(),
    dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName,
    totalIssues: report.summary.totalIssues,
    warnings: report.summary.warnings,
    suggestions: report.summary.suggestions,
    assetRowsChanged: 0
  });
  vamVisibleLog_('END runVisualAssetValidationDashboard');
  return report.summary;
}

function testVisualAssetExecutionLog() {
  vamStartRun_();
  const message = '[VAM_GOV_TEST] Execution log test ran at ' +
    Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z');
  Logger.log(message);
  return message;
}

function testVisualAssetDashboardLoggingOnly() {
  vamStartRun_();
  vamVisibleLog_('START testVisualAssetDashboardLoggingOnly');
  vamLog_('RUN_START', {
    testMode: true,
    spreadsheetWrites: false,
    dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName
  });
  vamLog_('READ_HEADERS', {
    testMode: true,
    lastRow: 3,
    lastColumn: 5,
    headerCount: 5,
    firstTenHeaders: 'Asset ID | Asset Name | Metadata Status | Next Workflow Step | Human Review Required'
  });
  vamLog_('VALIDATION_STEP', {
    testMode: true,
    validation: 'execution log visibility',
    newIssueCount: 0,
    runningIssueCount: 0
  });
  vamSheetLog_('TEST ONLY: would write dashboard header range A1:B5.');
  vamSheetLog_('TEST ONLY: would write summary metrics range A7:B14.');
  vamSheetLog_('TEST ONLY: would write top fixes range A16:G22.');
  vamSheetLog_('TEST ONLY: would write status filter view range A24:D29.');
  vamSheetLog_('TEST ONLY: would write Drive File ID review queue range A32:F43.');
  vamSheetLog_('TEST ONLY: would write duplicate Asset ID drilldown range A46:D57.');
  vamSheetLog_('TEST ONLY: would write workflow blocker summary range A60:E71.');
  vamLog_('RUN_COMPLETE', {
    testMode: true,
    spreadsheetWrites: false,
    assetRowsChanged: 0,
    dashboardRowsWritten: 0
  });
  vamVisibleLog_('END testVisualAssetDashboardLoggingOnly');
  return 'Visual Asset dashboard logging-only test completed. No spreadsheet data was changed.';
}

function vamWriteValidationDashboard_(report) {
  vamSheetLog_('Opening spreadsheet: ' + VAM_GOV_CONFIG.spreadsheetId);
  vamSheetLog_('Asset sheet is read-only in this run: ' + VAM_GOV_CONFIG.assetSheetName);
  vamSheetLog_('Dashboard target tab: ' + VAM_GOV_CONFIG.dashboardSheetName);
  vamLog_('DASHBOARD_WRITE_START', {
    spreadsheetId: VAM_GOV_CONFIG.spreadsheetId,
    dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName,
    totalIssues: report.summary.totalIssues
  });
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  let sheet = ss.getSheetByName(VAM_GOV_CONFIG.dashboardSheetName);
  let createdSheet = false;
  if (!sheet) {
    sheet = ss.insertSheet(VAM_GOV_CONFIG.dashboardSheetName);
    createdSheet = true;
    vamSheetLog_('Created dashboard tab: ' + VAM_GOV_CONFIG.dashboardSheetName);
  } else {
    vamSheetLog_('Found existing dashboard tab: ' + VAM_GOV_CONFIG.dashboardSheetName);
  }
  vamAssertDashboardTargetSafe_(ss, sheet);

  const existingFilter = sheet.getFilter();
  if (existingFilter) {
    existingFilter.remove();
    vamSheetLog_('Removed existing dashboard filter.');
    vamLog_('DASHBOARD_EXISTING_FILTER_REMOVED', {});
  }
  sheet.getDataRange().breakApart();
  vamSheetLog_('Broke apart merged ranges on dashboard tab.');
  sheet.clear();
  vamSheetLog_('Cleared dashboard tab only. Asset data was not cleared.');
  vamLog_('DASHBOARD_SHEET_PREPARED', {
    createdSheet: createdSheet
  });

  sheet.getRange(1, 1, 5, 2).setValues([
    ['Visual Asset Metadata Validation Dashboard', ''],
    ['Generated At', report.generatedAt],
    ['Mode', 'Warning only - no asset data changed'],
    ['Asset Sheet', VAM_GOV_CONFIG.assetSheetName],
    ['Rows Scanned', report.rowCount]
  ]);
  vamSheetLog_('Wrote dashboard header range A1:B5.');
  vamLog_('DASHBOARD_HEADER_WRITTEN', {
    range: 'A1:B5',
    rowCount: 5,
    assetRowsChanged: 0
  });

  sheet.getRange(7, 1, 8, 2).setValues([
    ['Metric', 'Count'],
    ['Missing required fields', report.summary.missingRequiredFields],
    ['Invalid status values', report.summary.invalidStatusValues],
    ['Duplicate Asset IDs', report.summary.duplicateAssetIds],
    ['Rows blocked from advancing', report.summary.rowsBlockedFromAdvancing],
    ['Warnings', report.summary.warnings],
    ['Suggestions', report.summary.suggestions],
    ['Total issues', report.summary.totalIssues]
  ]);
  vamSheetLog_('Wrote summary metrics range A7:B14.');
  vamLog_('DASHBOARD_SUMMARY_WRITTEN', {
    range: 'A7:B14',
    rowCount: 8,
    assetRowsChanged: 0
  });

  const topFixHeaders = ['Rank', 'Issue Count', 'Category', 'Field', 'Workflow Stage', 'Recommended Next Step', 'Sample Rows'];
  const topFixRows = report.topFixes.length
    ? report.topFixes.map(function(fix) {
      return [fix.rank, fix.count, fix.category, fix.fieldName, fix.stage, fix.recommendation, fix.sampleRows];
    })
    : [['', 0, 'No Issues Found', '', '', 'No warning-only validation issues were found during this run.', '']];
  sheet.getRange(16, 1, 1, topFixHeaders.length).setValues([['Top Fixes', '', '', '', '', '', '']]);
  sheet.getRange(17, 1, 1, topFixHeaders.length).setValues([topFixHeaders]);
  sheet.getRange(18, 1, topFixRows.length, topFixHeaders.length).setValues(topFixRows);
  vamSheetLog_('Wrote top fixes range A16:G' + (17 + topFixRows.length) + '. Top fix count: ' + report.topFixes.length);
  vamLog_('DASHBOARD_TOP_FIXES_WRITTEN', {
    range: 'A16:G' + (17 + topFixRows.length),
    rowCount: topFixRows.length + 2,
    assetRowsChanged: 0
  });

  const statusHeaders = ['Metadata Status', 'Count', 'Sample Rows', 'Recommended Next Step'];
  const statusRows = report.statusSummary.map(function(group) {
    return [group.status, group.count, group.sampleRows, group.recommendation];
  });
  sheet.getRange(24, 1, 1, statusHeaders.length).setValues([['Status Filter View', '', '', '']]);
  sheet.getRange(25, 1, 1, statusHeaders.length).setValues([statusHeaders]);
  sheet.getRange(26, 1, statusRows.length, statusHeaders.length).setValues(statusRows);
  vamSheetLog_('Wrote status filter view range A24:D' + (25 + statusRows.length) + '. Status groups: ' + statusRows.length);
  vamLog_('DASHBOARD_STATUS_FILTER_WRITTEN', {
    range: 'A24:D' + (25 + statusRows.length),
    rowCount: statusRows.length + 2,
    assetRowsChanged: 0
  });

  const driveHeaders = ['Row', 'Asset ID', 'Issue Type', 'Field', 'Recommended Review', 'Severity'];
  const driveRows = report.driveFileReviewQueue.length
    ? report.driveFileReviewQueue.map(function(item) {
      return [item.rowNumber, item.assetId, item.category, item.fieldName, item.recommendation, item.severity];
    })
    : [['', '', 'No Drive File ID Review Items', '', 'No Drive File ID suggestions or mismatches were found.', 'Info']];
  sheet.getRange(32, 1, 1, driveHeaders.length).setValues([['Drive File ID Review Queue', '', '', '', '', '']]);
  sheet.getRange(33, 1, 1, driveHeaders.length).setValues([driveHeaders]);
  sheet.getRange(34, 1, driveRows.length, driveHeaders.length).setValues(driveRows);
  vamSheetLog_('Wrote Drive File ID review queue range A32:F' + (33 + driveRows.length) + '. Review rows: ' + report.driveFileReviewQueue.length);
  vamLog_('DASHBOARD_DRIVE_REVIEW_WRITTEN', {
    range: 'A32:F' + (33 + driveRows.length),
    rowCount: driveRows.length + 2,
    assetRowsChanged: 0
  });

  const duplicateHeaders = ['Asset ID', 'Duplicate Count', 'Rows', 'Recommended Next Step'];
  const duplicateRows = report.duplicateAssetIdGroups.length
    ? report.duplicateAssetIdGroups.map(function(group) {
      return [group.assetId, group.count, group.rows, group.recommendation];
    })
    : [['', 0, '', 'No duplicate Asset ID groups were found.']];
  sheet.getRange(46, 1, 1, duplicateHeaders.length).setValues([['Duplicate Asset ID Drilldown', '', '', '']]);
  sheet.getRange(47, 1, 1, duplicateHeaders.length).setValues([duplicateHeaders]);
  sheet.getRange(48, 1, duplicateRows.length, duplicateHeaders.length).setValues(duplicateRows);
  vamSheetLog_('Wrote duplicate Asset ID drilldown range A46:D' + (47 + duplicateRows.length) + '. Duplicate groups: ' + report.duplicateAssetIdGroups.length);
  vamLog_('DASHBOARD_DUPLICATE_DRILLDOWN_WRITTEN', {
    range: 'A46:D' + (47 + duplicateRows.length),
    rowCount: duplicateRows.length + 2,
    assetRowsChanged: 0
  });

  const blockerHeaders = ['Workflow Stage', 'Next Workflow Step', 'Blocked Row Count', 'Sample Rows', 'Recommended Next Step'];
  const blockerRows = report.workflowBlockerSummary.length
    ? report.workflowBlockerSummary.map(function(group) {
      return [group.stage, group.nextStep, group.count, group.sampleRows, group.recommendation];
    })
    : [['', '', 0, '', 'No workflow blockers were found.']];
  sheet.getRange(60, 1, 1, blockerHeaders.length).setValues([['Workflow Blocker Summary', '', '', '', '']]);
  sheet.getRange(61, 1, 1, blockerHeaders.length).setValues([blockerHeaders]);
  sheet.getRange(62, 1, blockerRows.length, blockerHeaders.length).setValues(blockerRows);
  vamSheetLog_('Wrote workflow blocker summary range A60:E' + (61 + blockerRows.length) + '. Blocker groups: ' + report.workflowBlockerSummary.length);
  vamLog_('DASHBOARD_WORKFLOW_BLOCKERS_WRITTEN', {
    range: 'A60:E' + (61 + blockerRows.length),
    rowCount: blockerRows.length + 2,
    assetRowsChanged: 0
  });

  const headers = ['Row', 'Asset ID', 'Severity', 'Category', 'Field', 'Workflow Stage', 'Message', 'Suggestion'];
  const issueHeaderRow = 75;
  const issueFirstDataRow = issueHeaderRow + 1;
  sheet.getRange(issueHeaderRow, 1, 1, headers.length).setValues([headers]);
  vamSheetLog_('Wrote issue table headers range A' + issueHeaderRow + ':H' + issueHeaderRow + '.');
  vamLog_('DASHBOARD_ISSUE_HEADER_WRITTEN', {
    range: 'A' + issueHeaderRow + ':H' + issueHeaderRow,
    rowCount: 1,
    assetRowsChanged: 0
  });
  const rows = report.issues.length
    ? report.issues.map(function(issue) {
      return [issue.rowNumber, issue.assetId, issue.severity, issue.category, issue.fieldName, issue.stage, issue.message, issue.suggestion];
    })
    : [['', '', 'Info', 'No Issues Found', '', '', 'No warning-only validation issues were found during this run.', '']];
  sheet.getRange(issueFirstDataRow, 1, rows.length, headers.length).setValues(rows);
  vamSheetLog_('Wrote issue rows range A' + issueFirstDataRow + ':H' + (issueHeaderRow + rows.length) + '. Row count: ' + rows.length);
  vamLog_('DASHBOARD_ISSUES_WRITTEN', {
    range: 'A' + issueFirstDataRow + ':H' + (issueHeaderRow + rows.length),
    rowCount: rows.length,
    assetRowsChanged: 0
  });

  sheet.setFrozenRows(7);
  sheet.getRange('A1:B1').merge().setFontWeight('bold').setFontSize(14);
  sheet.getRange('A2:A5').setFontWeight('bold');
  sheet.getRange('A7:B7').setFontWeight('bold').setBackground('#d9ead3');
  sheet.getRange('A16:G16').merge().setFontWeight('bold').setBackground('#fff2cc');
  sheet.getRange('A17:G17').setFontWeight('bold').setBackground('#fff2cc');
  sheet.getRange('A24:D24').merge().setFontWeight('bold').setBackground('#eadcf8');
  sheet.getRange('A25:D25').setFontWeight('bold').setBackground('#eadcf8');
  sheet.getRange('A32:F32').merge().setFontWeight('bold').setBackground('#fce5cd');
  sheet.getRange('A33:F33').setFontWeight('bold').setBackground('#fce5cd');
  sheet.getRange('A46:D46').merge().setFontWeight('bold').setBackground('#f4cccc');
  sheet.getRange('A47:D47').setFontWeight('bold').setBackground('#f4cccc');
  sheet.getRange('A60:E60').merge().setFontWeight('bold').setBackground('#d9eaf7');
  sheet.getRange('A61:E61').setFontWeight('bold').setBackground('#d9eaf7');
  sheet.getRange(issueHeaderRow, 1, 1, headers.length).setFontWeight('bold').setBackground('#cfe2f3');
  sheet.getRange(issueHeaderRow, 1, rows.length + 1, headers.length).createFilter();
  sheet.autoResizeColumns(1, headers.length);
  sheet.setColumnWidth(6, 360);
  sheet.setColumnWidth(7, 420);
  sheet.setColumnWidth(8, 360);
  SpreadsheetApp.flush();
  vamSheetLog_('Applied dashboard formatting and filter.');
  vamLog_('DASHBOARD_FORMATTING_APPLIED', {
    issueTableHeaderRow: issueHeaderRow,
    issueTableRows: rows.length + 1,
    assetRowsChanged: 0
  });
  vamSheetLog_('Finished. Created sheet: ' + createdSheet + '. Asset rows changed: 0. Dashboard rows written: ' + rows.length);
  vamLog_('DASHBOARD_WRITE_COMPLETE_NO_ASSET_ROWS_CHANGED', {
    issueRowsWritten: rows.length,
    topFixesWritten: report.topFixes.length,
    statusGroupsWritten: report.statusSummary.length,
    driveReviewRowsWritten: report.driveFileReviewQueue.length,
    duplicateGroupsWritten: report.duplicateAssetIdGroups.length,
    workflowBlockerGroupsWritten: report.workflowBlockerSummary.length,
    dashboardSheetId: sheet.getSheetId ? sheet.getSheetId() : '',
    createdSheet: createdSheet
  });
}

function vamAssertDashboardTargetSafe_(spreadsheet, dashboardSheet) {
  const assetSheet = spreadsheet.getSheetByName(VAM_GOV_CONFIG.assetSheetName);
  const sameConfiguredName = vamCompare_(VAM_GOV_CONFIG.dashboardSheetName) === vamCompare_(VAM_GOV_CONFIG.assetSheetName);
  const sameResolvedSheet = assetSheet && dashboardSheet && assetSheet === dashboardSheet;
  if (sameConfiguredName || sameResolvedSheet) {
    vamLog_('DASHBOARD_TARGET_GUARD_BLOCKED', {
      dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName,
      assetSheetName: VAM_GOV_CONFIG.assetSheetName,
      sameConfiguredName: sameConfiguredName,
      sameResolvedSheet: !!sameResolvedSheet,
      assetRowsChanged: 0
    });
    throw new Error('Unsafe dashboard target: dashboard sheet resolves to the asset sheet. Refusing to clear or write.');
  }
}

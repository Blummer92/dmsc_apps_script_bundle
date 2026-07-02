/**
 * Visual Asset Governance Feature Views
 *
 * Adds expanded, warning-only review sections to the Validation Dashboard.
 * This module does not write to asset rows.
 */

function runVisualAssetFullFeatureDashboard() {
  const startedAt = new Date();
  vamFeatureLog_('FEATURE_RUN_START', {
    dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName
  });

  const report = buildVisualAssetValidationReport();
  const context = vamReadAssetRows_();
  const featureReport = vamFeatureBuildReport_(report, context);
  vamFeatureWriteDashboard_(featureReport);

  vamFeatureLog_('FEATURE_RUN_COMPLETE', {
    durationMs: new Date().getTime() - startedAt.getTime(),
    assetRowsChanged: 0,
    topFixes: featureReport.topFixes.length,
    statusGroups: featureReport.statusSummary.length,
    driveReviewRows: featureReport.driveFileReviewQueue.length,
    duplicateGroups: featureReport.duplicateAssetIdGroups.length,
    workflowBlockerGroups: featureReport.workflowBlockerSummary.length
  });
  return featureReport.summary;
}

function testVisualAssetFeatureDashboardLoggingOnly() {
  vamFeatureLog_('FEATURE_TEST_START', {
    spreadsheetWrites: false
  });
  [
    'Top Fixes A16:G22',
    'Status Filter View A24:D29',
    'Drive File ID Review Queue A32:F43',
    'Duplicate Asset ID Drilldown A46:D57',
    'Workflow Blocker Summary A60:E71',
    'Detailed Issue Table A75:H'
  ].forEach(function(sectionName) {
    vamFeatureSheetLog_('TEST ONLY: would write ' + sectionName + '.');
  });
  vamFeatureLog_('FEATURE_TEST_COMPLETE', {
    spreadsheetWrites: false,
    assetRowsChanged: 0
  });
  return 'Feature dashboard logging-only test completed. No spreadsheet data was changed.';
}

function getVisualAssetStatusReviewSummary() {
  return vamFeatureBuildReport_(buildVisualAssetValidationReport(), vamReadAssetRows_()).statusSummary;
}

function getVisualAssetDriveFileIdReviewQueue() {
  return vamFeatureBuildReport_(buildVisualAssetValidationReport(), vamReadAssetRows_()).driveFileReviewQueue;
}

function getVisualAssetDuplicateAssetIdGroups() {
  return vamFeatureBuildReport_(buildVisualAssetValidationReport(), vamReadAssetRows_()).duplicateAssetIdGroups;
}

function getVisualAssetWorkflowBlockers() {
  return vamFeatureBuildReport_(buildVisualAssetValidationReport(), vamReadAssetRows_()).workflowBlockerSummary;
}

function vamFeatureBuildReport_(report, context) {
  const featureReport = {
    generatedAt: report.generatedAt,
    rowCount: report.rowCount,
    warningOnly: true,
    issues: report.issues,
    summary: report.summary,
    topFixes: vamFeatureBuildTopFixes_(report.issues, 5),
    statusSummary: vamFeatureBuildStatusSummary_(context),
    driveFileReviewQueue: vamFeatureBuildDriveFileReviewQueue_(report.issues, 10),
    duplicateAssetIdGroups: vamFeatureBuildDuplicateGroups_(context, 10),
    workflowBlockerSummary: vamFeatureBuildWorkflowBlockers_(report.issues, 10)
  };

  vamFeatureLog_('FEATURE_REPORT_READY', {
    totalIssues: featureReport.summary.totalIssues,
    topFixes: featureReport.topFixes.length,
    statusGroups: featureReport.statusSummary.length,
    driveReviewRows: featureReport.driveFileReviewQueue.length,
    duplicateGroups: featureReport.duplicateAssetIdGroups.length,
    workflowBlockerGroups: featureReport.workflowBlockerSummary.length
  });
  vamFeatureLogFeatureSamples_(featureReport);
  return featureReport;
}

function vamFeatureWriteDashboard_(report) {
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  let sheet = ss.getSheetByName(VAM_GOV_CONFIG.dashboardSheetName);
  let createdSheet = false;
  if (!sheet) {
    sheet = ss.insertSheet(VAM_GOV_CONFIG.dashboardSheetName);
    createdSheet = true;
  }

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getDataRange().breakApart();
  sheet.clear();
  vamFeatureSheetLog_('Prepared dashboard tab. Asset rows changed: 0.');

  sheet.getRange(1, 1, 5, 2).setValues([
    ['Visual Asset Metadata Validation Dashboard', ''],
    ['Generated At', report.generatedAt],
    ['Mode', 'Warning only - no asset data changed'],
    ['Asset Sheet', VAM_GOV_CONFIG.assetSheetName],
    ['Rows Scanned', report.rowCount]
  ]);

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

  vamFeatureWriteTable_(sheet, 16, 'Top Fixes', ['Rank', 'Issue Count', 'Category', 'Field', 'Workflow Stage', 'Recommended Next Step', 'Sample Rows'], report.topFixes.map(function(fix) {
    return [fix.rank, fix.count, fix.category, fix.fieldName, fix.stage, fix.recommendation, fix.sampleRows];
  }), [['', 0, 'No Issues Found', '', '', 'No warning-only validation issues were found during this run.', '']], '#fff2cc');

  vamFeatureWriteTable_(sheet, 24, 'Status Filter View', ['Metadata Status', 'Count', 'Sample Rows', 'Recommended Next Step'], report.statusSummary.map(function(group) {
    return [group.status, group.count, group.sampleRows, group.recommendation];
  }), [['', 0, '', 'Metadata Status column was not found or no target statuses were present.']], '#eadcf8');

  vamFeatureWriteTable_(sheet, 32, 'Drive File ID Review Queue', ['Row', 'Asset ID', 'Issue Type', 'Field', 'Recommended Review', 'Severity'], report.driveFileReviewQueue.map(function(item) {
    return [item.rowNumber, item.assetId, item.category, item.fieldName, item.recommendation, item.severity];
  }), [['', '', 'No Drive File ID Review Items', '', 'No Drive File ID suggestions or mismatches were found.', 'Info']], '#fce5cd');

  vamFeatureWriteTable_(sheet, 46, 'Duplicate Asset ID Drilldown', ['Asset ID', 'Duplicate Count', 'Rows', 'Recommended Next Step'], report.duplicateAssetIdGroups.map(function(group) {
    return [group.assetId, group.count, group.rows, group.recommendation];
  }), [['', 0, '', 'No duplicate Asset ID groups were found.']], '#f4cccc');

  vamFeatureWriteTable_(sheet, 60, 'Workflow Blocker Summary', ['Workflow Stage', 'Next Workflow Step', 'Blocked Row Count', 'Sample Rows', 'Recommended Next Step'], report.workflowBlockerSummary.map(function(group) {
    return [group.stage, group.nextStep, group.count, group.sampleRows, group.recommendation];
  }), [['', '', 0, '', 'No workflow blockers were found.']], '#d9eaf7');

  const issueHeaders = ['Row', 'Asset ID', 'Severity', 'Category', 'Field', 'Workflow Stage', 'Message', 'Suggestion'];
  const issueRows = report.issues.length
    ? report.issues.map(function(issue) {
      return [issue.rowNumber, issue.assetId, issue.severity, issue.category, issue.fieldName, issue.stage, issue.message, issue.suggestion];
    })
    : [['', '', 'Info', 'No Issues Found', '', '', 'No warning-only validation issues were found during this run.', '']];
  sheet.getRange(75, 1, 1, issueHeaders.length).setValues([issueHeaders]);
  sheet.getRange(76, 1, issueRows.length, issueHeaders.length).setValues(issueRows);

  sheet.setFrozenRows(75);
  sheet.getRange('A1:B1').merge().setFontWeight('bold').setFontSize(14);
  sheet.getRange('A2:A5').setFontWeight('bold');
  sheet.getRange('A7:B7').setFontWeight('bold').setBackground('#d9ead3');
  sheet.getRange(75, 1, 1, issueHeaders.length).setFontWeight('bold').setBackground('#cfe2f3');
  sheet.getRange(75, 1, issueRows.length + 1, issueHeaders.length).createFilter();
  sheet.autoResizeColumns(1, issueHeaders.length);
  sheet.setColumnWidth(5, 280);
  sheet.setColumnWidth(6, 360);
  sheet.setColumnWidth(7, 420);
  sheet.setColumnWidth(8, 360);
  SpreadsheetApp.flush();

  vamFeatureLog_('FEATURE_DASHBOARD_WRITE_COMPLETE', {
    createdSheet: createdSheet,
    assetRowsChanged: 0,
    issueRowsWritten: issueRows.length,
    topFixesWritten: report.topFixes.length,
    statusGroupsWritten: report.statusSummary.length,
    driveReviewRowsWritten: report.driveFileReviewQueue.length,
    duplicateGroupsWritten: report.duplicateAssetIdGroups.length,
    workflowBlockerGroupsWritten: report.workflowBlockerSummary.length
  });
}

function vamFeatureWriteTable_(sheet, startRow, title, headers, rows, emptyRows, color) {
  const safeRows = rows.length ? rows : emptyRows;
  sheet.getRange(startRow, 1, 1, headers.length).setValues([[title].concat(headers.slice(1).map(function() { return ''; }))]);
  sheet.getRange(startRow + 1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(startRow + 2, 1, safeRows.length, headers.length).setValues(safeRows);
  sheet.getRange(startRow, 1, 1, headers.length).merge().setFontWeight('bold').setBackground(color);
  sheet.getRange(startRow + 1, 1, 1, headers.length).setFontWeight('bold').setBackground(color);
  vamFeatureSheetLog_('Wrote ' + title + ' starting at row ' + startRow + '. Rows: ' + rows.length);
}

function vamFeatureBuildTopFixes_(issues, limit) {
  const groups = {};
  issues.forEach(function(issue) {
    const key = [issue.category || 'General', issue.fieldName || 'General', issue.stage || ''].join('||');
    groups[key] = groups[key] || {
      category: issue.category || 'General',
      fieldName: issue.fieldName || 'General',
      stage: issue.stage || '',
      count: 0,
      sampleRows: [],
      recommendation: vamFeatureRecommendIssue_(issue)
    };
    groups[key].count++;
    if (issue.rowNumber && groups[key].sampleRows.length < 8) groups[key].sampleRows.push(issue.rowNumber);
  });
  return Object.keys(groups).map(function(key) { return groups[key]; })
    .sort(function(a, b) { return b.count - a.count || (a.category < b.category ? -1 : 1); })
    .slice(0, limit)
    .map(function(group, index) {
      return {
        rank: index + 1,
        count: group.count,
        category: group.category,
        fieldName: group.fieldName,
        stage: group.stage,
        recommendation: group.recommendation,
        sampleRows: group.sampleRows.join(', ')
      };
    });
}

function vamFeatureBuildStatusSummary_(context) {
  const statusField = VAM_GOV_CONFIG.fields.metadataStatus || 'Metadata Status';
  const statuses = ['Blocked', 'Needs Human Review', 'Needs Metadata', 'Complete'];
  const groups = {};
  statuses.forEach(function(status) {
    groups[status] = { status: status, count: 0, sampleRows: [], recommendation: vamFeatureRecommendStatus_(status) };
  });
  if (!vamHasHeader_(context.headerMap, statusField)) {
    return statuses.map(function(status) {
      return { status: status, count: 0, sampleRows: '', recommendation: 'Metadata Status column was not found.' };
    });
  }
  context.records.forEach(function(record) {
    const status = vamClean_(record.values[statusField]);
    if (!groups[status]) return;
    groups[status].count++;
    if (groups[status].sampleRows.length < 8) groups[status].sampleRows.push(record.rowNumber);
  });
  return statuses.map(function(status) {
    return {
      status: status,
      count: groups[status].count,
      sampleRows: groups[status].sampleRows.join(', '),
      recommendation: groups[status].recommendation
    };
  });
}

function vamFeatureBuildDriveFileReviewQueue_(issues, limit) {
  return issues.filter(function(issue) {
    return issue.category === 'Drive File ID Suggestion' || issue.category === 'Drive File ID Mismatch';
  }).slice(0, limit).map(function(issue) {
    return {
      rowNumber: issue.rowNumber,
      assetId: issue.assetId,
      category: issue.category,
      fieldName: issue.fieldName,
      recommendation: issue.suggestion || 'Review Drive link and exact file mapping.',
      severity: issue.severity
    };
  });
}

function vamFeatureBuildDuplicateGroups_(context, limit) {
  const fieldName = VAM_GOV_CONFIG.fields.assetId;
  if (!vamHasHeader_(context.headerMap, fieldName)) return [];
  const groups = {};
  context.records.forEach(function(record) {
    const assetId = vamClean_(record.values[fieldName]);
    if (!assetId) return;
    const key = vamCompare_(assetId);
    groups[key] = groups[key] || { assetId: assetId, rows: [] };
    groups[key].rows.push(record.rowNumber);
  });
  return Object.keys(groups).map(function(key) { return groups[key]; })
    .filter(function(group) { return group.rows.length > 1; })
    .sort(function(a, b) { return b.rows.length - a.rows.length || (a.assetId < b.assetId ? -1 : 1); })
    .slice(0, limit)
    .map(function(group) {
      return {
        assetId: group.assetId,
        count: group.rows.length,
        rows: group.rows.join(', '),
        recommendation: 'Resolve duplicate identity or document the duplicate relationship before advancing.'
      };
    });
}

function vamFeatureBuildWorkflowBlockers_(issues, limit) {
  const groups = {};
  issues.filter(function(issue) { return issue.category === 'Blocked From Advancing'; })
    .forEach(function(issue) {
      const nextStepMatch = issue.message.match(/"([^"]+)"/);
      const nextStep = nextStepMatch ? nextStepMatch[1] : '';
      const key = [issue.stage || 'Workflow', nextStep].join('||');
      groups[key] = groups[key] || {
        stage: issue.stage || 'Workflow',
        nextStep: nextStep,
        count: 0,
        sampleRows: [],
        recommendation: issue.suggestion || 'Complete the missing stage-gate fields before advancing workflow.'
      };
      groups[key].count++;
      if (issue.rowNumber && groups[key].sampleRows.length < 8) groups[key].sampleRows.push(issue.rowNumber);
    });
  return Object.keys(groups).map(function(key) { return groups[key]; })
    .sort(function(a, b) { return b.count - a.count || (a.stage < b.stage ? -1 : 1); })
    .slice(0, limit)
    .map(function(group) {
      return {
        stage: group.stage,
        nextStep: group.nextStep,
        count: group.count,
        sampleRows: group.sampleRows.join(', '),
        recommendation: group.recommendation
      };
    });
}

function vamFeatureLogFeatureSamples_(report) {
  report.topFixes.forEach(function(fix) { vamFeatureLog_('TOP_FIX', fix); });
  report.statusSummary.forEach(function(group) { vamFeatureLog_('STATUS_SUMMARY', group); });
  report.driveFileReviewQueue.slice(0, 5).forEach(function(item) { vamFeatureLog_('DRIVE_ID_REVIEW', item); });
  report.duplicateAssetIdGroups.slice(0, 5).forEach(function(group) { vamFeatureLog_('DUPLICATE_ASSET_GROUP', group); });
  report.workflowBlockerSummary.slice(0, 5).forEach(function(group) { vamFeatureLog_('WORKFLOW_BLOCKER_SUMMARY', group); });
}

function vamFeatureRecommendIssue_(issue) {
  if (issue.category === 'Missing Required Field') return 'Complete this required field or document a blocker for the listed rows.';
  if (issue.category === 'Invalid Controlled Value') return issue.suggestion || 'Replace values with the approved controlled vocabulary.';
  if (issue.category === 'Duplicate Asset ID') return 'Resolve duplicate identity or document the duplicate relationship before advancing.';
  if (issue.category === 'Blocked From Advancing') return issue.suggestion || 'Complete the missing stage-gate fields before advancing workflow.';
  if (issue.category === 'Drive File ID Suggestion') return 'Review the parsed Drive File ID suggestion before writing any value to the asset row.';
  if (issue.category === 'Drive File ID Mismatch') return 'Review exact Drive file mapping before changing the Drive File ID.';
  if (issue.category === 'Canonical Filename Suggestion') return 'Review the suggested canonical filename before writing any value to the asset row.';
  return issue.suggestion || 'Review the grouped warning rows and resolve the metadata issue.';
}

function vamFeatureRecommendStatus_(status) {
  if (status === 'Blocked') return 'Review blocker details before any workflow advancement.';
  if (status === 'Needs Human Review') return 'Assign or complete human review before approval.';
  if (status === 'Needs Metadata') return 'Complete required metadata fields first.';
  if (status === 'Complete') return 'No immediate action; spot-check completed records as needed.';
  return 'Review status.';
}

function vamFeatureLog_(eventName, details) {
  Logger.log('[VAM_FEATURE] ' + JSON.stringify({
    event: eventName,
    timestamp: Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    details: details || {}
  }));
}

function vamFeatureSheetLog_(message) {
  Logger.log('[VAM_FEATURE_SHEET] ' + message);
}

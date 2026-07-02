/**
 * Visual Asset Governance Safety Patch
 *
 * Loads after the base validator and tightens warning-only safety behavior.
 * This file intentionally does not write to asset rows.
 */

var VAM_GOV_SAFETY_ACTIVE_RUN_ID = '';

const VAM_GOV_SAFETY_EXTRA_CONTROLLED_VALUES = Object.freeze({
  'Best-Fit Unit': ['Candy Branding Design', 'Adobe Express Foundations', 'Typography Foundations', 'Expressive Typography Poster', 'Video Foundations', 'Portfolio / Showcase', 'Other / Unclear'],
  'Quality / Readiness': ['Clear', 'Needs Cleanup', 'Blurry', 'Cropped', 'Low Resolution', 'Needs Source Verification', 'Not Classroom Ready'],
  'Source / Permission Status': ['Known', 'Unclear', 'Missing', 'Needs Verification'],
  'Keep Decision': ['Keep', 'Keep as Reference', 'Duplicate', 'Low Confidence', 'Do Not Use Yet'],
  'Suggested Reuse': ['Worksheet', 'Slide', 'Prompt', 'Critique Activity', 'Template', 'Reference Library', 'Teacher Background'],
  'Agent Decision': ['approved_internal_classroom', 'needs_review', 'blocked', 'reference_only', 'candidate_pending_qa', 'missing_file'],
  'Approval Gate Complete?': ['Yes', 'No']
});

const VAM_GOV_SAFETY_MULTI_SELECT_FIELDS = Object.freeze([
  'Suggested Reuse'
]);

const VAM_GOV_SAFETY_ENGINEER_PROMPT = [
  'Google Workspace Automation Engineer fix prompt:',
  'Review the Visual Asset Metadata Governance Apps Script and make the safety fixes requested by the Apps Script Sync Test Agent.',
  'Keep the workflow warning-only unless governance owner approval explicitly authorizes writes.',
  'Add a dashboard target guard so Validation Dashboard can never resolve to the Visual Asset Metadata asset sheet.',
  'Reject duplicate headers before validation so schema collisions cannot silently read the wrong column.',
  'Clarify workflow stage matching for overlapping Next Workflow Step values.',
  'Define whether controlled-value fields are single-select or semicolon-separated multi-select, then test that behavior.',
  'Before any future asset-row, Notion, production, or Visual Asset Library write, require dry-run success, explicit approval, and synced_count === verified_count.',
  'Log each runtime write phase to the Apps Script execution log, including target sheet, range, row count, and confirmation that no asset rows were changed.'
].join('\n');

function runVisualAssetValidationDashboard() {
  const startedAt = new Date();
  vamSafetyStartRun_();
  vamVisibleLog_('START runVisualAssetValidationDashboard');
  vamSafetyLogEngineerPromptForFixes_();
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

function buildVisualAssetValidationReport() {
  vamLog_('REPORT_BUILD_START', {
    requiredFieldCount: VAM_GOV_CONFIG.requiredFields.length,
    controlledFieldCount: Object.keys(vamSafetyGetControlledValues_()).length,
    workflowStageCount: vamSafetyGetWorkflowStages_().length
  });
  const context = vamReadAssetRows_();
  const issues = [];
  vamPushIssuesWithLog_(issues, 'required fields', vamValidateMissingRequiredFields_(context));
  vamPushIssuesWithLog_(issues, 'controlled values', vamValidateControlledValues_(context));
  vamPushIssuesWithLog_(issues, 'Drive File ID extraction', vamValidateDriveFileIds_(context));
  vamPushIssuesWithLog_(issues, 'Canonical Filename suggestions', vamValidateCanonicalFilenames_(context));
  vamPushIssuesWithLog_(issues, 'duplicate Asset IDs', vamValidateDuplicateAssetIds_(context));
  vamPushIssuesWithLog_(issues, 'workflow stage gates', vamValidateWorkflowStages_(context));

  const summary = vamSummarizeIssues_(issues);
  const topFixes = vamBuildTopFixes_(issues, 5);
  const statusSummary = vamSafetyBuildStatusSummary_(context);
  const driveFileReviewQueue = vamSafetyBuildDriveFileReviewQueue_(issues, 10);
  const duplicateAssetIdGroups = vamSafetyBuildDuplicateAssetIdGroups_(context, 10);
  const workflowBlockerSummary = vamSafetyBuildWorkflowBlockerSummary_(issues, 10);

  vamLog_('REPORT_BUILD_COMPLETE', {
    rowCount: context.records.length,
    totalIssues: summary.totalIssues,
    warnings: summary.warnings,
    suggestions: summary.suggestions,
    topFixCount: topFixes.length,
    statusGroupCount: statusSummary.length,
    driveReviewCount: driveFileReviewQueue.length,
    duplicateGroupCount: duplicateAssetIdGroups.length,
    workflowBlockerGroupCount: workflowBlockerSummary.length
  });
  vamLogTopFixes_(topFixes);
  vamLogStatusSummary_(statusSummary);
  vamLogDriveReviewQueue_(driveFileReviewQueue);
  vamLogDuplicateGroups_(duplicateAssetIdGroups);
  vamLogWorkflowBlockers_(workflowBlockerSummary);
  vamLogSampleIssues_(issues);

  return {
    generatedAt: Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    rowCount: context.records.length,
    warningOnly: true,
    issues: issues,
    summary: summary,
    topFixes: topFixes,
    statusSummary: statusSummary,
    driveFileReviewQueue: driveFileReviewQueue,
    duplicateAssetIdGroups: duplicateAssetIdGroups,
    workflowBlockerSummary: workflowBlockerSummary
  };
}

function vamValidateControlledValues_(context) {
  const issues = [];
  const controlledValues = vamSafetyGetControlledValues_();
  Object.keys(controlledValues).forEach(function(fieldName) {
    if (!vamHasHeader_(context.headerMap, fieldName)) return;
    const allowed = controlledValues[fieldName];
    const allowedLookup = allowed.reduce(function(map, value) {
      map[vamCompare_(value)] = true;
      return map;
    }, {});
    context.records.forEach(function(record) {
      const value = vamClean_(record.values[fieldName]);
      if (!value) return;
      const selectedValues = vamSafetyIsMultiSelectControlledField_(fieldName)
        ? vamSafetySplitControlledValues_(value)
        : [value];
      const invalidValues = selectedValues.filter(function(selectedValue) {
        return !allowedLookup[vamCompare_(selectedValue)];
      });
      if (invalidValues.length) {
        issues.push(vamIssue_(record, 'Warning', 'Invalid Controlled Value', fieldName, 'Value is outside the controlled vocabulary: "' + invalidValues.join('; ') + '".', 'Use one of: ' + allowed.join('; '), ''));
      }
    });
  });
  return issues;
}

function vamValidateWorkflowStages_(context) {
  const issues = [];
  const nextStepField = VAM_GOV_CONFIG.fields.nextWorkflowStep;
  if (!vamHasHeader_(context.headerMap, nextStepField)) return issues;

  context.records.forEach(function(record) {
    const nextStep = vamClean_(record.values[nextStepField]);
    if (!nextStep) return;
    const blockers = [];
    vamSafetyGetWorkflowStages_().forEach(function(stage) {
      const applies = stage.nextSteps.some(function(step) {
        return vamCompare_(step) === vamCompare_(nextStep);
      });
      if (!applies) return;
      const missing = stage.requiredFields.filter(function(fieldName) {
        return vamHasHeader_(context.headerMap, fieldName) && !vamClean_(record.values[fieldName]);
      });
      if (missing.length) {
        blockers.push({
          stage: stage,
          missingFields: missing
        });
      }
    });
    if (blockers.length) {
      issues.push(vamIssue_(
        record,
        'Warning',
        'Blocked From Advancing',
        nextStepField,
        'Row is marked for "' + nextStep + '" but is missing stage fields: ' + vamSafetyFormatWorkflowBlockerFields_(blockers) + '.',
        blockers.map(function(blocker) {
          return blocker.stage.name + ': ' + blocker.stage.blocker;
        }).join(' | '),
        blockers.map(function(blocker) {
          return blocker.stage.name;
        }).join('; ')
      ));
    }
  });
  return issues;
}

function vamWriteValidationDashboard_(report) {
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  let sheet = ss.getSheetByName(VAM_GOV_CONFIG.dashboardSheetName);
  let createdSheet = false;
  vamLog_('DASHBOARD_WRITE_TARGET_RESOLVED', {
    dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName,
    assetSheetName: VAM_GOV_CONFIG.assetSheetName
  });
  if (!sheet) {
    sheet = ss.insertSheet(VAM_GOV_CONFIG.dashboardSheetName);
    createdSheet = true;
    vamSheetLog_('Created dashboard tab: ' + VAM_GOV_CONFIG.dashboardSheetName);
  } else {
    vamSheetLog_('Found existing dashboard tab: ' + VAM_GOV_CONFIG.dashboardSheetName);
  }
  vamSafetyAssertDashboardTargetSafe_(ss, sheet);

  const existingFilter = sheet.getFilter();
  if (existingFilter) {
    existingFilter.remove();
    vamLog_('DASHBOARD_EXISTING_FILTER_REMOVED', {});
  }
  sheet.getDataRange().breakApart();
  sheet.clear();
  vamLog_('DASHBOARD_BREAK_APART_AND_CLEAR', {
    dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName,
    assetRowsChanged: 0
  });

  sheet.getRange(1, 1, 5, 2).setValues([
    ['Visual Asset Metadata Validation Dashboard', ''],
    ['Generated At', report.generatedAt],
    ['Mode', 'Warning only - no asset data changed'],
    ['Asset Sheet', VAM_GOV_CONFIG.assetSheetName],
    ['Rows Scanned', report.rowCount]
  ]);
  vamLog_('DASHBOARD_HEADER_WRITTEN', { range: 'A1:B5', rowCount: 5, assetRowsChanged: 0 });

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
  vamLog_('DASHBOARD_SUMMARY_WRITTEN', { range: 'A7:B14', rowCount: 8, assetRowsChanged: 0 });

  vamSafetyWriteTable_(sheet, 16, 'Top Fixes', ['Rank', 'Issue Count', 'Category', 'Field', 'Workflow Stage', 'Recommended Next Step', 'Sample Rows'], report.topFixes.map(function(fix) {
    return [fix.rank, fix.count, fix.category, fix.fieldName, fix.stage, fix.recommendation, fix.sampleRows];
  }), [['', 0, 'No Issues Found', '', '', 'No warning-only validation issues were found during this run.', '']], '#fff2cc', 'DASHBOARD_TOP_FIXES_WRITTEN');

  vamSafetyWriteTable_(sheet, 24, 'Status Filter View', ['Metadata Status', 'Count', 'Sample Rows', 'Recommended Next Step'], report.statusSummary.map(function(group) {
    return [group.status, group.count, group.sampleRows, group.recommendation];
  }), [['', 0, '', 'Metadata Status column was not found or no target statuses were present.']], '#eadcf8', 'DASHBOARD_STATUS_FILTER_WRITTEN');

  vamSafetyWriteTable_(sheet, 32, 'Drive File ID Review Queue', ['Row', 'Asset ID', 'Issue Type', 'Field', 'Recommended Review', 'Severity'], report.driveFileReviewQueue.map(function(item) {
    return [item.rowNumber, item.assetId, item.category, item.fieldName, item.recommendation, item.severity];
  }), [['', '', 'No Drive File ID Review Items', '', 'No Drive File ID suggestions or mismatches were found.', 'Info']], '#fce5cd', 'DASHBOARD_DRIVE_REVIEW_WRITTEN');

  vamSafetyWriteTable_(sheet, 46, 'Duplicate Asset ID Drilldown', ['Asset ID', 'Duplicate Count', 'Rows', 'Recommended Next Step'], report.duplicateAssetIdGroups.map(function(group) {
    return [group.assetId, group.count, group.rows, group.recommendation];
  }), [['', 0, '', 'No duplicate Asset ID groups were found.']], '#f4cccc', 'DASHBOARD_DUPLICATE_DRILLDOWN_WRITTEN');

  vamSafetyWriteTable_(sheet, 60, 'Workflow Blocker Summary', ['Workflow Stage', 'Next Workflow Step', 'Blocked Row Count', 'Sample Rows', 'Recommended Next Step'], report.workflowBlockerSummary.map(function(group) {
    return [group.stage, group.nextStep, group.count, group.sampleRows, group.recommendation];
  }), [['', '', 0, '', 'No workflow blockers were found.']], '#d9eaf7', 'DASHBOARD_WORKFLOW_BLOCKERS_WRITTEN');

  const issueHeaders = ['Row', 'Asset ID', 'Severity', 'Category', 'Field', 'Workflow Stage', 'Message', 'Suggestion'];
  const issueRows = report.issues.length
    ? report.issues.map(function(issue) {
      return [issue.rowNumber, issue.assetId, issue.severity, issue.category, issue.fieldName, issue.stage, issue.message, issue.suggestion];
    })
    : [['', '', 'Info', 'No Issues Found', '', '', 'No warning-only validation issues were found during this run.', '']];
  sheet.getRange(75, 1, 1, issueHeaders.length).setValues([issueHeaders]);
  vamLog_('DASHBOARD_ISSUE_HEADER_WRITTEN', { range: 'A75:H75', rowCount: 1, assetRowsChanged: 0 });
  sheet.getRange(76, 1, issueRows.length, issueHeaders.length).setValues(issueRows);
  vamLog_('DASHBOARD_ISSUES_WRITTEN', { range: 'A76:H' + (75 + issueRows.length), rowCount: issueRows.length, assetRowsChanged: 0 });

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
  sheet.getRange(75, 1, 1, issueHeaders.length).setFontWeight('bold').setBackground('#cfe2f3');
  sheet.getRange(75, 1, issueRows.length + 1, issueHeaders.length).createFilter();
  sheet.autoResizeColumns(1, issueHeaders.length);
  sheet.setColumnWidth(6, 360);
  sheet.setColumnWidth(7, 420);
  sheet.setColumnWidth(8, 360);
  SpreadsheetApp.flush();
  vamLog_('DASHBOARD_FORMATTING_APPLIED', {
    issueTableHeaderRow: 75,
    issueTableRows: issueRows.length + 1,
    assetRowsChanged: 0
  });
  vamLog_('DASHBOARD_WRITE_COMPLETE_NO_ASSET_ROWS_CHANGED', {
    issueRowsWritten: issueRows.length,
    topFixesWritten: report.topFixes.length,
    statusGroupsWritten: report.statusSummary.length,
    driveReviewRowsWritten: report.driveFileReviewQueue.length,
    duplicateGroupsWritten: report.duplicateAssetIdGroups.length,
    workflowBlockerGroupsWritten: report.workflowBlockerSummary.length,
    dashboardSheetId: sheet.getSheetId ? sheet.getSheetId() : '',
    createdSheet: createdSheet
  });
}

function vamBuildHeaderMap_(headers) {
  vamSafetyAssertNoDuplicateHeaders_(headers);
  return headers.reduce(function(map, header, index) {
    if (header) map[header] = index;
    return map;
  }, {});
}

function vamLog_(eventName, details) {
  const safeDetails = Object.assign({}, details || {});
  if (!safeDetails.runId) {
    safeDetails.runId = vamSafetyEnsureRunId_();
  }
  Logger.log('[VAM_GOV] ' + JSON.stringify({
    event: eventName,
    timestamp: Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    details: safeDetails
  }));
}

function vamLogStatusSummary_(statusSummary) {
  statusSummary.forEach(function(group) {
    vamLog_('STATUS_SUMMARY', {
      status: group.status,
      count: group.count,
      sampleRows: group.sampleRows,
      recommendation: group.recommendation
    });
  });
}

function vamLogDriveReviewQueue_(queue) {
  queue.slice(0, 5).forEach(function(item) {
    vamLog_('DRIVE_ID_REVIEW', {
      rowNumber: item.rowNumber,
      assetId: item.assetId,
      category: item.category,
      recommendation: item.recommendation
    });
  });
  if (queue.length > 5) {
    vamLog_('DRIVE_ID_REVIEW_TRUNCATED', {
      shown: 5,
      remaining: queue.length - 5
    });
  }
}

function vamLogDuplicateGroups_(groups) {
  groups.slice(0, 5).forEach(function(group) {
    vamLog_('DUPLICATE_ASSET_GROUP', {
      assetId: group.assetId,
      count: group.count,
      rows: group.rows
    });
  });
  if (groups.length > 5) {
    vamLog_('DUPLICATE_ASSET_GROUPS_TRUNCATED', {
      shown: 5,
      remaining: groups.length - 5
    });
  }
}

function vamLogWorkflowBlockers_(groups) {
  groups.slice(0, 5).forEach(function(group) {
    vamLog_('WORKFLOW_BLOCKER_SUMMARY', {
      stage: group.stage,
      nextStep: group.nextStep,
      count: group.count,
      sampleRows: group.sampleRows
    });
  });
  if (groups.length > 5) {
    vamLog_('WORKFLOW_BLOCKERS_TRUNCATED', {
      shown: 5,
      remaining: groups.length - 5
    });
  }
}

function vamSafetyWriteTable_(sheet, startRow, title, headers, rows, emptyRows, color, eventName) {
  const safeRows = rows.length ? rows : emptyRows;
  sheet.getRange(startRow, 1, 1, headers.length).setValues([[title].concat(headers.slice(1).map(function() { return ''; }))]);
  sheet.getRange(startRow + 1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(startRow + 2, 1, safeRows.length, headers.length).setValues(safeRows);
  sheet.getRange(startRow, 1, 1, headers.length).merge().setFontWeight('bold').setBackground(color);
  sheet.getRange(startRow + 1, 1, 1, headers.length).setFontWeight('bold').setBackground(color);
  vamLog_(eventName, {
    startRow: startRow,
    rowCount: safeRows.length + 2,
    assetRowsChanged: 0
  });
}

function vamSafetyAssertDashboardTargetSafe_(spreadsheet, dashboardSheet) {
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

function vamSafetyAssertNoDuplicateHeaders_(headers) {
  const seen = {};
  const duplicates = [];
  headers.forEach(function(header) {
    const key = vamCompare_(header);
    if (!key) return;
    if (seen[key]) {
      duplicates.push(header);
      return;
    }
    seen[key] = true;
  });
  if (duplicates.length) {
    throw new Error('Duplicate header(s) found in asset sheet: ' + vamSafetyUniqueValues_(duplicates).join(', ') + '. Resolve duplicate columns before validation.');
  }
}

function vamSafetyGetControlledValues_() {
  const merged = {};
  Object.keys(VAM_GOV_CONFIG.controlledValues).forEach(function(fieldName) {
    merged[fieldName] = VAM_GOV_CONFIG.controlledValues[fieldName];
  });
  Object.keys(VAM_GOV_SAFETY_EXTRA_CONTROLLED_VALUES).forEach(function(fieldName) {
    merged[fieldName] = VAM_GOV_SAFETY_EXTRA_CONTROLLED_VALUES[fieldName];
  });
  return merged;
}

function vamSafetyGetWorkflowStages_() {
  const stages = VAM_GOV_CONFIG.workflowStages.slice();
  const hasGeneration = stages.some(function(stage) {
    return vamCompare_(stage.name) === 'generation';
  });
  if (!hasGeneration) {
    stages.splice(2, 0, {
      name: 'Generation',
      nextSteps: ['Upload to Drive'],
      requiredFields: ['AI Generation Tool', 'Date Created', 'Human Review Required'],
      blocker: 'Tool/source/reference information is missing or policy review is required first.'
    });
  }
  return stages;
}

function vamSafetyBuildStatusSummary_(context) {
  const statusField = VAM_GOV_CONFIG.fields.metadataStatus;
  const targetStatuses = ['Blocked', 'Needs Human Review', 'Needs Metadata', 'Complete'];
  const groups = {};
  targetStatuses.forEach(function(status) {
    groups[status] = {
      status: status,
      count: 0,
      sampleRows: [],
      recommendation: vamSafetyRecommendStatusAction_(status)
    };
  });
  if (!vamHasHeader_(context.headerMap, statusField)) {
    return targetStatuses.map(function(status) {
      return {
        status: status,
        count: 0,
        sampleRows: '',
        recommendation: 'Metadata Status column was not found.'
      };
    });
  }
  context.records.forEach(function(record) {
    const status = vamClean_(record.values[statusField]);
    if (!groups[status]) return;
    groups[status].count++;
    if (groups[status].sampleRows.length < 8) groups[status].sampleRows.push(record.rowNumber);
  });
  return targetStatuses.map(function(status) {
    const group = groups[status];
    return {
      status: group.status,
      count: group.count,
      sampleRows: group.sampleRows.join(', '),
      recommendation: group.recommendation
    };
  });
}

function vamSafetyBuildDriveFileReviewQueue_(issues, limit) {
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

function vamSafetyBuildDuplicateAssetIdGroups_(context, limit) {
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

function vamSafetyBuildWorkflowBlockerSummary_(issues, limit) {
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

function vamSafetyRecommendStatusAction_(status) {
  if (status === 'Blocked') return 'Review blocker details before any workflow advancement.';
  if (status === 'Needs Human Review') return 'Assign or complete human review before approval.';
  if (status === 'Needs Metadata') return 'Complete required metadata fields first.';
  if (status === 'Complete') return 'No immediate action; spot-check completed records as needed.';
  return 'Review status.';
}

function vamSafetyFormatWorkflowBlockerFields_(blockers) {
  return blockers.map(function(blocker) {
    return blocker.stage.name + ': ' + blocker.missingFields.join(', ');
  }).join(' | ');
}

function vamSafetySplitControlledValues_(value) {
  return String(value || '')
    .split(';')
    .map(function(item) { return item.trim(); })
    .filter(Boolean);
}

function vamSafetyIsMultiSelectControlledField_(fieldName) {
  return VAM_GOV_SAFETY_MULTI_SELECT_FIELDS.some(function(candidate) {
    return vamCompare_(candidate) === vamCompare_(fieldName);
  });
}

function vamSafetyUniqueValues_(values) {
  const seen = {};
  return values.filter(function(value) {
    const key = vamCompare_(value);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function vamSafetyStartRun_() {
  const uuid = Utilities.getUuid ? Utilities.getUuid() : String(Math.floor(Math.random() * 100000000));
  VAM_GOV_SAFETY_ACTIVE_RUN_ID = Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyyMMdd-HHmmss') + '-' + String(uuid).slice(0, 8);
  return VAM_GOV_SAFETY_ACTIVE_RUN_ID;
}

function vamSafetyEnsureRunId_() {
  if (!VAM_GOV_SAFETY_ACTIVE_RUN_ID) {
    vamSafetyStartRun_();
  }
  return VAM_GOV_SAFETY_ACTIVE_RUN_ID;
}

function vamSafetyLogEngineerPromptForFixes_() {
  const lines = VAM_GOV_SAFETY_ENGINEER_PROMPT.split('\n');
  vamLog_('ENGINEER_FIX_PROMPT_START', { lineCount: lines.length });
  lines.forEach(function(line, index) {
    vamLog_('ENGINEER_FIX_PROMPT_LINE', {
      lineNumber: index + 1,
      text: line
    });
  });
  vamLog_('ENGINEER_FIX_PROMPT_END', {});
}

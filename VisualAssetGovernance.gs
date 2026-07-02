/**
 * Visual Asset Metadata Governance Validator
 *
 * Warning-only validator for the Visual Asset Metadata workbook.
 * This module is designed to live beside the existing DMSC Dashboard code.
 *
 * Safety boundary:
 * - Does not overwrite asset rows.
 * - Does not approve assets.
 * - Does not migrate historical data.
 * - Writes only to generated reporting tabs.
 */

var VAM_GOV_RUN_LOG = [];

const VAM_GOV_CONFIG = Object.freeze({
  spreadsheetId: '19rnFcTTs2zdaOs3wyZ_0NebjzczTPY9EqaLsybEU6bw',
  assetSheetName: 'Visual Asset Metadata',
  dashboardSheetName: 'Validation Dashboard',
  runLogSheetName: 'Validation Run Log',
  headerRow: 1,
  firstDataRow: 2,
  timezone: 'America/Detroit',
  fields: Object.freeze({
    assetId: 'Asset ID',
    driveLink: 'Drive Link',
    driveFileId: 'Drive File ID',
    originalFilename: 'Original Filename',
    canonicalFilename: 'Canonical Filename',
    nextWorkflowStep: 'Next Workflow Step'
  }),
  requiredFields: Object.freeze([
    'Asset ID',
    'Asset Name',
    'Asset Type',
    'Course',
    'Intended Instructional Use',
    'Description',
    'Metadata Status',
    'Next Workflow Step',
    'Human Review Required'
  ]),
  controlledValues: Object.freeze({
    'Asset Type': ['Icon', 'Icon Set', 'Image', 'Worksheet Visual', 'Branding Sample', 'Screenshot', 'PDF Extract', 'Reference', 'AI-Generated Visual', 'Other'],
    'Student-Facing?': ['Yes', 'No', 'Unclear'],
    'Teacher-Facing?': ['Yes', 'No', 'Unclear'],
    'Duplicate Status': ['Primary', 'Duplicate', 'Near Duplicate', 'Possible Duplicate', 'Unique', 'Unclear'],
    'Exact File ID Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Approved Folder Placement Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Source / Safe-Use Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Visual QA / Readability Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Internal Classroom Use Boundary': ['Pending', 'Internal classroom only', 'Teacher/reference only', 'Not student-facing', 'Unknown', 'Do not use'],
    'Course': ['Digital Media', 'Other / Unclear'],
    'Prompt Version': ['v1', 'v2', 'v3', 'Current', 'Archived'],
    'Style Category': ['Icon', 'Flat illustration', 'Classroom visual', 'Diagram', 'Photo-realistic', 'Reference', 'Other'],
    'AI Generation Tool': ['Pending', 'ChatGPT image generation', 'DALL-E', 'Midjourney', 'Adobe Firefly', 'Other', 'Not Applicable'],
    'Prompt Source': ['Pending', 'Visual Asset Director', 'Human-authored', 'Revised from existing prompt', 'Imported package', 'Other'],
    'Reference Image Used': ['Pending', 'Yes', 'No', 'Not Applicable'],
    'External Source Used': ['Pending', 'Yes', 'No', 'Not Applicable'],
    'Copyright or Trademark Risk Assessment': ['Pending', 'Low', 'Medium', 'High', 'Blocked', 'Not Applicable'],
    'Human Review Required': ['Pending', 'Yes', 'No', 'Not Applicable'],
    'Source Approval Status': ['Pending', 'Not Started', 'Needs Review', 'Approved', 'Blocked', 'Not Applicable'],
    'Approved Use': ['Pending', 'Internal classroom only', 'Teacher/reference only', 'Not student-facing', 'Approved student-facing', 'Do not use', 'Not Applicable'],
    'Reuse Status': ['Pending', 'New prompt package', 'Candidate', 'Approved for reuse', 'Reference only', 'Do not reuse', 'Superseded', 'Duplicate'],
    'Drive Upload Status': ['Pending', 'Not generated', 'Not uploaded', 'Uploaded', 'Linked', 'Missing file', 'Not Applicable'],
    'Source Authority Review': ['Pending', 'Not started', 'Needs review', 'Reviewed', 'Approved', 'Blocked', 'Not Applicable'],
    'Metadata Status': ['Draft', 'Metadata Ready', 'Needs Metadata', 'Needs Human Review', 'Complete', 'Blocked', 'Superseded'],
    'Next Workflow Step': ['Pending', 'Generate image', 'Upload to Drive', 'Source review', 'Human review', 'Visual QA', 'Approve use', 'Archive', 'Blocked', 'Complete']
  }),
  workflowStages: Object.freeze([
    Object.freeze({
      name: 'Metadata',
      nextSteps: ['Pending', 'Generate image'],
      requiredFields: ['Asset ID', 'Asset Name', 'Asset Type', 'Course', 'Unit', 'Lesson', 'Intended Instructional Use', 'Description', 'Metadata Status'],
      blocker: 'Asset identity is missing, duplicated, or mixed with unrelated assets.'
    }),
    Object.freeze({
      name: 'Prompt Package',
      nextSteps: ['Upload to Drive'],
      requiredFields: ['Prompt Version', 'Full Production Prompt', 'Style Category', 'Prompt Source', 'Reference Image Used', 'External Source Used', 'Created By', 'Date Created'],
      blocker: 'Prompt text, intended use, tool, source, or reference status is unknown.'
    }),
    Object.freeze({
      name: 'Drive Upload',
      nextSteps: ['Visual QA', 'Source review'],
      requiredFields: ['Drive Link', 'Drive File ID', 'Drive Upload Status', 'Folder', 'Folder ID', 'Exact File ID Verified?', 'Last Verified Date'],
      blocker: 'File ID, link, folder, or mapping is ambiguous or missing.'
    }),
    Object.freeze({
      name: 'QA',
      nextSteps: ['Approve use', 'Human review'],
      requiredFields: ['Visual QA Status', 'Visual QA / Readability Verified?', 'Alt Text', 'Review Owner', 'Review Date'],
      blocker: 'Image is unreadable, cropped, unclear, or missing accessibility review.'
    }),
    Object.freeze({
      name: 'Governance',
      nextSteps: ['Approve use', 'Human review'],
      requiredFields: ['Source Authority Review', 'Source Approval Status', 'Safe Use Status', 'Source Visibility', 'Citation Evidence', 'Provenance Status', 'External Source Used', 'Copyright or Trademark Risk Assessment', 'Internal Classroom Use Boundary', 'Human Review Required'],
      blocker: 'Evidence is missing, source is unclear, or risk is unresolved.'
    }),
    Object.freeze({
      name: 'Approval',
      nextSteps: ['Archive', 'Complete'],
      requiredFields: ['Approved Use', 'Approved Folder Placement Verified?', 'Approval Evidence Link', 'Last Verified Date'],
      blocker: 'Approval evidence, safe-use clearance, QA, or placement evidence is incomplete.'
    })
  ])
});

function runVisualAssetValidationDashboard() {
  VAM_GOV_RUN_LOG = [];
  const startedAt = new Date();
  vamLog_('RUN_START', {
    spreadsheetId: VAM_GOV_CONFIG.spreadsheetId,
    assetSheetName: VAM_GOV_CONFIG.assetSheetName,
    dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName,
    runLogSheetName: VAM_GOV_CONFIG.runLogSheetName
  });
  const report = buildVisualAssetValidationReport();
  vamLog_('REPORT_READY', report.summary);
  vamWriteValidationDashboard_(report);
  vamLog_('RUN_COMPLETE', {
    durationMs: new Date().getTime() - startedAt.getTime(),
    dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName,
    runLogSheetName: VAM_GOV_CONFIG.runLogSheetName,
    totalIssues: report.summary.totalIssues,
    warnings: report.summary.warnings,
    suggestions: report.summary.suggestions
  });
  vamWriteValidationRunLog_(report);
  return report.summary;
}

function buildVisualAssetValidationReport() {
  vamLog_('REPORT_BUILD_START', {
    requiredFieldCount: VAM_GOV_CONFIG.requiredFields.length,
    controlledFieldCount: Object.keys(VAM_GOV_CONFIG.controlledValues).length,
    workflowStageCount: VAM_GOV_CONFIG.workflowStages.length
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
  vamLog_('REPORT_BUILD_COMPLETE', {
    rowCount: context.records.length,
    totalIssues: summary.totalIssues,
    warnings: summary.warnings,
    suggestions: summary.suggestions
  });
  vamLogSampleIssues_(issues);

  return {
    generatedAt: Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    rowCount: context.records.length,
    warningOnly: true,
    issues: issues,
    summary: summary
  };
}

function vamPushIssuesWithLog_(targetIssues, validationName, newIssues) {
  Array.prototype.push.apply(targetIssues, newIssues);
  vamLog_('VALIDATION_STEP', {
    validation: validationName,
    newIssueCount: newIssues.length,
    runningIssueCount: targetIssues.length
  });
}

function vamLogSampleIssues_(issues) {
  issues.slice(0, 10).forEach(function(issue, index) {
    vamLog_('ISSUE_SAMPLE_' + (index + 1), {
      rowNumber: issue.rowNumber,
      assetId: issue.assetId,
      severity: issue.severity,
      category: issue.category,
      fieldName: issue.fieldName,
      stage: issue.stage,
      message: issue.message,
      suggestion: issue.suggestion
    });
  });
  if (issues.length > 10) {
    vamLog_('ISSUE_SAMPLE_TRUNCATED', {
      shown: 10,
      remaining: issues.length - 10
    });
  }
}

function getVisualAssetMissingRequiredFields() {
  return buildVisualAssetValidationReport().issues.filter(function(issue) {
    return issue.category === 'Missing Required Field';
  });
}

function getVisualAssetDriveFileIdSuggestions() {
  return buildVisualAssetValidationReport().issues.filter(function(issue) {
    return issue.category === 'Drive File ID Suggestion' || issue.category === 'Drive File ID Mismatch';
  });
}

function getVisualAssetCanonicalFilenameSuggestions() {
  return buildVisualAssetValidationReport().issues.filter(function(issue) {
    return issue.category === 'Canonical Filename Suggestion';
  });
}

function vamReadAssetRows_() {
  vamLog_('READ_START', {
    spreadsheetId: VAM_GOV_CONFIG.spreadsheetId,
    assetSheetName: VAM_GOV_CONFIG.assetSheetName
  });
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(VAM_GOV_CONFIG.assetSheetName);
  if (!sheet) throw new Error('Missing asset sheet: ' + VAM_GOV_CONFIG.assetSheetName);

  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  const headers = lastColumn
    ? sheet.getRange(VAM_GOV_CONFIG.headerRow, 1, 1, lastColumn).getDisplayValues()[0].map(vamClean_)
    : [];
  const headerMap = vamBuildHeaderMap_(headers);
  vamLog_('READ_HEADERS', {
    lastRow: lastRow,
    lastColumn: lastColumn,
    headerCount: headers.filter(Boolean).length,
    firstTenHeaders: headers.slice(0, 10).join(' | ')
  });

  if (lastRow < VAM_GOV_CONFIG.firstDataRow || lastColumn < 1) {
    vamLog_('READ_COMPLETE_EMPTY', {
      records: 0
    });
    return { sheet: sheet, headers: headers, headerMap: headerMap, records: [] };
  }

  const rows = sheet
    .getRange(VAM_GOV_CONFIG.firstDataRow, 1, lastRow - VAM_GOV_CONFIG.firstDataRow + 1, lastColumn)
    .getValues();
  const records = rows
    .map(function(row, index) {
      return {
        rowNumber: VAM_GOV_CONFIG.firstDataRow + index,
        row: row,
        values: vamRowToObject_(headers, row)
      };
    })
    .filter(function(record) {
      return record.row.some(function(value) { return vamClean_(value) !== ''; });
    });

  vamLog_('READ_COMPLETE', {
    rawDataRows: rows.length,
    nonEmptyRecords: records.length,
    firstDataRow: VAM_GOV_CONFIG.firstDataRow,
    lastDataRow: lastRow
  });
  return { sheet: sheet, headers: headers, headerMap: headerMap, records: records };
}

function vamValidateMissingRequiredFields_(context) {
  const issues = [];
  context.records.forEach(function(record) {
    VAM_GOV_CONFIG.requiredFields.forEach(function(fieldName) {
      if (vamHasHeader_(context.headerMap, fieldName) && !vamClean_(record.values[fieldName])) {
        issues.push(vamIssue_(record, 'Warning', 'Missing Required Field', fieldName, 'Required field is blank.', 'Complete the field or document a blocker.', 'Metadata'));
      }
    });
  });
  return issues;
}

function vamValidateControlledValues_(context) {
  const issues = [];
  Object.keys(VAM_GOV_CONFIG.controlledValues).forEach(function(fieldName) {
    if (!vamHasHeader_(context.headerMap, fieldName)) return;
    const allowed = VAM_GOV_CONFIG.controlledValues[fieldName];
    const allowedLookup = allowed.reduce(function(map, value) {
      map[vamCompare_(value)] = true;
      return map;
    }, {});
    context.records.forEach(function(record) {
      const value = vamClean_(record.values[fieldName]);
      if (value && !allowedLookup[vamCompare_(value)]) {
        issues.push(vamIssue_(record, 'Warning', 'Invalid Controlled Value', fieldName, 'Value is outside the controlled vocabulary: "' + value + '".', 'Use one of: ' + allowed.join('; '), ''));
      }
    });
  });
  return issues;
}

function vamValidateDriveFileIds_(context) {
  const issues = [];
  const linkField = VAM_GOV_CONFIG.fields.driveLink;
  const idField = VAM_GOV_CONFIG.fields.driveFileId;
  if (!vamHasHeader_(context.headerMap, linkField) || !vamHasHeader_(context.headerMap, idField)) return issues;

  context.records.forEach(function(record) {
    const driveLink = vamClean_(record.values[linkField]);
    const currentId = vamClean_(record.values[idField]);
    const parsedId = vamExtractDriveFileId_(driveLink);
    if (!driveLink || !parsedId) return;
    if (!currentId) {
      issues.push(vamIssue_(record, 'Info', 'Drive File ID Suggestion', idField, 'Drive Link contains a parseable file ID, but Drive File ID is blank.', parsedId, 'Drive Upload'));
    } else if (currentId !== parsedId) {
      issues.push(vamIssue_(record, 'Warning', 'Drive File ID Mismatch', idField, 'Drive File ID does not match the ID parsed from Drive Link.', 'Review exact file mapping. Parsed ID: ' + parsedId, 'Drive Upload'));
    }
  });
  return issues;
}

function vamValidateCanonicalFilenames_(context) {
  const issues = [];
  const originalField = VAM_GOV_CONFIG.fields.originalFilename;
  const canonicalField = VAM_GOV_CONFIG.fields.canonicalFilename;
  if (!vamHasHeader_(context.headerMap, originalField) || !vamHasHeader_(context.headerMap, canonicalField)) return issues;

  context.records.forEach(function(record) {
    const original = vamClean_(record.values[originalField]);
    const canonical = vamClean_(record.values[canonicalField]);
    const suggestion = vamSuggestCanonicalFilename_(original);
    if (original && !canonical && suggestion) {
      issues.push(vamIssue_(record, 'Info', 'Canonical Filename Suggestion', canonicalField, 'Canonical Filename is blank and can be derived from Original Filename.', suggestion, 'Metadata'));
    }
  });
  return issues;
}

function vamValidateDuplicateAssetIds_(context) {
  const issues = [];
  const fieldName = VAM_GOV_CONFIG.fields.assetId;
  if (!vamHasHeader_(context.headerMap, fieldName)) return issues;

  const groups = {};
  context.records.forEach(function(record) {
    const assetId = vamClean_(record.values[fieldName]);
    if (!assetId) return;
    const key = vamCompare_(assetId);
    groups[key] = groups[key] || { assetId: assetId, records: [] };
    groups[key].records.push(record);
  });

  Object.keys(groups).forEach(function(key) {
    const group = groups[key];
    if (group.records.length < 2) return;
    const rows = group.records.map(function(record) { return record.rowNumber; }).join(', ');
    group.records.forEach(function(record) {
      issues.push(vamIssue_(record, 'Warning', 'Duplicate Asset ID', fieldName, 'Asset ID appears on multiple rows: ' + rows + '.', 'Resolve duplicate identity or document duplicate relationship before advancing.', 'Metadata'));
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
    VAM_GOV_CONFIG.workflowStages.forEach(function(stage) {
      const applies = stage.nextSteps.some(function(step) { return vamCompare_(step) === vamCompare_(nextStep); });
      if (!applies) return;
      const missing = stage.requiredFields.filter(function(fieldName) {
        return vamHasHeader_(context.headerMap, fieldName) && !vamClean_(record.values[fieldName]);
      });
      if (missing.length) {
        issues.push(vamIssue_(record, 'Warning', 'Blocked From Advancing', nextStepField, 'Row is marked for "' + nextStep + '" but is missing stage fields: ' + missing.join(', ') + '.', stage.blocker, stage.name));
      }
    });
  });
  return issues;
}

function vamWriteValidationDashboard_(report) {
  Logger.log('[VAM_GOV_SHEET] Opening spreadsheet: ' + VAM_GOV_CONFIG.spreadsheetId);
  Logger.log('[VAM_GOV_SHEET] Asset sheet is read-only in this run: ' + VAM_GOV_CONFIG.assetSheetName);
  Logger.log('[VAM_GOV_SHEET] Dashboard target tab: ' + VAM_GOV_CONFIG.dashboardSheetName);
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
    Logger.log('[VAM_GOV_SHEET] Created dashboard tab: ' + VAM_GOV_CONFIG.dashboardSheetName);
  } else {
    Logger.log('[VAM_GOV_SHEET] Found existing dashboard tab: ' + VAM_GOV_CONFIG.dashboardSheetName);
  }

  const existingFilter = sheet.getFilter();
  if (existingFilter) {
    existingFilter.remove();
    Logger.log('[VAM_GOV_SHEET] Removed existing dashboard filter.');
    vamLog_('DASHBOARD_EXISTING_FILTER_REMOVED', {});
  }
  sheet.getDataRange().breakApart();
  Logger.log('[VAM_GOV_SHEET] Broke apart merged ranges on dashboard tab.');
  sheet.clear();
  Logger.log('[VAM_GOV_SHEET] Cleared dashboard tab only. Asset data was not cleared.');
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
  Logger.log('[VAM_GOV_SHEET] Wrote dashboard header range A1:B5.');

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
  Logger.log('[VAM_GOV_SHEET] Wrote summary metrics range A7:B14.');

  const headers = ['Row', 'Asset ID', 'Severity', 'Category', 'Field', 'Workflow Stage', 'Message', 'Suggestion'];
  sheet.getRange(17, 1, 1, headers.length).setValues([headers]);
  Logger.log('[VAM_GOV_SHEET] Wrote issue table headers range A17:H17.');
  const rows = report.issues.length
    ? report.issues.map(function(issue) {
      return [issue.rowNumber, issue.assetId, issue.severity, issue.category, issue.fieldName, issue.stage, issue.message, issue.suggestion];
    })
    : [['', '', 'Info', 'No Issues Found', '', '', 'No warning-only validation issues were found during this run.', '']];
  sheet.getRange(18, 1, rows.length, headers.length).setValues(rows);
  Logger.log('[VAM_GOV_SHEET] Wrote issue rows range A18:H' + (17 + rows.length) + '. Row count: ' + rows.length);

  sheet.setFrozenRows(17);
  sheet.getRange('A1:B1').merge().setFontWeight('bold').setFontSize(14);
  sheet.getRange('A2:A5').setFontWeight('bold');
  sheet.getRange('A7:B7').setFontWeight('bold').setBackground('#d9ead3');
  sheet.getRange('A17:H17').setFontWeight('bold').setBackground('#cfe2f3');
  sheet.getRange(17, 1, rows.length + 1, headers.length).createFilter();
  sheet.autoResizeColumns(1, headers.length);
  sheet.setColumnWidth(7, 420);
  sheet.setColumnWidth(8, 360);
  SpreadsheetApp.flush();
  Logger.log('[VAM_GOV_SHEET] Applied dashboard formatting and filter.');
  Logger.log('[VAM_GOV_SHEET] Finished. Created sheet: ' + createdSheet + '. Asset rows changed: 0. Dashboard rows written: ' + rows.length);
  vamLog_('DASHBOARD_WRITE_COMPLETE', {
    issueRowsWritten: rows.length,
    dashboardSheetId: sheet.getSheetId(),
    createdSheet: createdSheet
  });
}

function vamWriteValidationRunLog_(report) {
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  let sheet = ss.getSheetByName(VAM_GOV_CONFIG.runLogSheetName);
  let createdSheet = false;
  if (!sheet) {
    sheet = ss.insertSheet(VAM_GOV_CONFIG.runLogSheetName);
    createdSheet = true;
  }

  const headers = ['Run ID', 'Timestamp', 'Event', 'Details'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0].join('|');
    if (existingHeaders !== headers.join('|')) {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  }

  const runId = Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 10000);
  const rows = VAM_GOV_RUN_LOG.map(function(entry) {
    return [
      runId,
      entry.timestamp,
      entry.event,
      JSON.stringify(entry.details || {})
    ];
  });
  rows.push([
    runId,
    Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    'RUN_LOG_WRITE_COMPLETE',
    JSON.stringify({
      logRowsWritten: rows.length + 1,
      createdSheet: createdSheet,
      assetRowsChanged: 0,
      dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName,
      totalIssues: report.summary.totalIssues
    })
  ]);

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#fce5cd');
  sheet.autoResizeColumns(1, headers.length);
  sheet.setColumnWidth(4, 720);
  SpreadsheetApp.flush();
  Logger.log('[VAM_GOV_SHEET] Wrote validation run log tab: ' + VAM_GOV_CONFIG.runLogSheetName + '. Log rows written: ' + rows.length + '. Asset rows changed: 0.');
}

function vamSummarizeIssues_(issues) {
  const summary = {
    missingRequiredFields: 0,
    invalidStatusValues: 0,
    duplicateAssetIds: 0,
    rowsBlockedFromAdvancing: 0,
    warnings: 0,
    suggestions: 0,
    totalIssues: issues.length
  };
  issues.forEach(function(issue) {
    if (issue.category === 'Missing Required Field') summary.missingRequiredFields++;
    if (issue.category === 'Invalid Controlled Value') summary.invalidStatusValues++;
    if (issue.category === 'Duplicate Asset ID') summary.duplicateAssetIds++;
    if (issue.category === 'Blocked From Advancing') summary.rowsBlockedFromAdvancing++;
    if (issue.severity === 'Warning') summary.warnings++;
    if (issue.severity === 'Info') summary.suggestions++;
  });
  return summary;
}

function vamExtractDriveFileId_(value) {
  const text = vamClean_(value);
  if (!text || text === 'Pending' || text === 'Not Applicable') return '';
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{20,})$/
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match && match[1]) return match[1];
  }
  return '';
}

function vamSuggestCanonicalFilename_(value) {
  return vamClean_(value)
    .replace(/\s+/g, '_')
    .replace(/[^\w.\-()]+/g, '')
    .replace(/_+/g, '_');
}

function vamBuildHeaderMap_(headers) {
  return headers.reduce(function(map, header, index) {
    if (header) map[header] = index;
    return map;
  }, {});
}

function vamRowToObject_(headers, row) {
  return headers.reduce(function(values, header, index) {
    if (header) values[header] = row[index];
    return values;
  }, {});
}

function vamHasHeader_(headerMap, fieldName) {
  return Object.prototype.hasOwnProperty.call(headerMap, fieldName);
}

function vamIssue_(record, severity, category, fieldName, message, suggestion, stage) {
  return {
    rowNumber: record ? record.rowNumber : '',
    assetId: record ? vamClean_(record.values[VAM_GOV_CONFIG.fields.assetId]) : '',
    severity: severity,
    category: category,
    fieldName: fieldName || '',
    message: message,
    suggestion: suggestion || '',
    stage: stage || ''
  };
}

function vamClean_(value) {
  return String(value == null ? '' : value).trim();
}

function vamCompare_(value) {
  return vamClean_(value).toLowerCase();
}

function vamLog_(eventName, details) {
  const payload = {
    event: eventName,
    timestamp: Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    details: details || {}
  };
  VAM_GOV_RUN_LOG.push(payload);
  const message = '[VAM_GOV] ' + JSON.stringify(payload);
  console.log(message);
  Logger.log(message);
}

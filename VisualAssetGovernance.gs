/**
 * Visual Asset Metadata Governance Validator
 * Warning-only module for the existing DMSC Apps Script dashboard bundle.
 *
 * Safety boundary:
 * - Does not overwrite asset rows.
 * - Does not approve assets.
 * - Does not migrate historical data.
 * - Writes only to the generated Validation Dashboard tab.
 */

const VAM_GOV_CONFIG = Object.freeze({
  spreadsheetId: '19rnFcTTs2zdaOs3wyZ_0NebjzczTPY9EqaLsybEU6bw',
  assetSheetName: 'Visual Asset Metadata',
  dashboardSheetName: 'Validation Dashboard',
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
    'Next Workflow Step': ['Pending', 'Generate image', 'Upload to Drive', 'Source review', 'Human review', 'Visual QA', 'Approve use', 'Archive', 'Blocked', 'Complete'],
    'Exact File ID Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Approved Folder Placement Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Source / Safe-Use Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Visual QA / Readability Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Internal Classroom Use Boundary': ['Pending', 'Internal classroom only', 'Teacher/reference only', 'Not student-facing', 'Unknown', 'Do not use']
  }),
  stageGates: Object.freeze([
    Object.freeze({ name: 'Metadata', nextSteps: ['Pending', 'Generate image'], requiredFields: ['Asset ID', 'Asset Name', 'Asset Type', 'Course', 'Unit', 'Lesson', 'Intended Instructional Use', 'Description', 'Metadata Status'] }),
    Object.freeze({ name: 'Prompt Package', nextSteps: ['Upload to Drive'], requiredFields: ['Prompt Version', 'Full Production Prompt', 'Style Category', 'Prompt Source', 'Reference Image Used', 'External Source Used', 'Created By', 'Date Created'] }),
    Object.freeze({ name: 'Drive Upload', nextSteps: ['Visual QA', 'Source review'], requiredFields: ['Drive Link', 'Drive File ID', 'Drive Upload Status', 'Folder', 'Folder ID', 'Exact File ID Verified?', 'Last Verified Date'] }),
    Object.freeze({ name: 'QA', nextSteps: ['Approve use', 'Human review'], requiredFields: ['Visual QA Status', 'Visual QA / Readability Verified?', 'Alt Text', 'Review Owner', 'Review Date'] }),
    Object.freeze({ name: 'Governance', nextSteps: ['Approve use', 'Human review'], requiredFields: ['Source Authority Review', 'Source Approval Status', 'Safe Use Status', 'Source Visibility', 'Citation Evidence', 'Provenance Status', 'External Source Used', 'Copyright or Trademark Risk Assessment', 'Internal Classroom Use Boundary', 'Human Review Required'] }),
    Object.freeze({ name: 'Approval', nextSteps: ['Archive', 'Complete'], requiredFields: ['Approved Use', 'Approved Folder Placement Verified?', 'Approval Evidence Link', 'Last Verified Date'] })
  ])
});

function runVisualAssetValidationDashboard() {
  const report = buildVisualAssetValidationReport();
  vamWriteValidationDashboard_(report);
  return report.summary;
}

function buildVisualAssetValidationReport() {
  const context = vamReadAssetRows_();
  const issues = [];
  issues.push.apply(issues, vamValidateRequiredFields_(context));
  issues.push.apply(issues, vamValidateControlledValues_(context));
  issues.push.apply(issues, vamValidateDriveFileIds_(context));
  issues.push.apply(issues, vamValidateCanonicalFilenames_(context));
  issues.push.apply(issues, vamValidateDuplicateAssetIds_(context));
  issues.push.apply(issues, vamValidateWorkflowStages_(context));
  return {
    generatedAt: Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    rowCount: context.records.length,
    warningOnly: true,
    issues: issues,
    summary: vamSummarizeIssues_(issues)
  };
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
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(VAM_GOV_CONFIG.assetSheetName);
  if (!sheet) throw new Error('Missing asset sheet: ' + VAM_GOV_CONFIG.assetSheetName);
  const lastColumn = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  const headers = lastColumn ? sheet.getRange(VAM_GOV_CONFIG.headerRow, 1, 1, lastColumn).getDisplayValues()[0].map(vamClean_) : [];
  const headerMap = vamHeaderMap_(headers);
  if (lastRow < VAM_GOV_CONFIG.firstDataRow || lastColumn < 1) return { headers: headers, headerMap: headerMap, records: [] };
  const rows = sheet.getRange(VAM_GOV_CONFIG.firstDataRow, 1, lastRow - VAM_GOV_CONFIG.firstDataRow + 1, lastColumn).getValues();
  const records = rows.map(function(row, index) {
    return { rowNumber: VAM_GOV_CONFIG.firstDataRow + index, row: row, values: vamRowObject_(headers, row) };
  }).filter(function(record) {
    return record.row.some(function(value) { return vamClean_(value) !== ''; });
  });
  return { headers: headers, headerMap: headerMap, records: records };
}

function vamValidateRequiredFields_(context) {
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
    const allowedLookup = allowed.reduce(function(map, value) { map[vamCompare_(value)] = true; return map; }, {});
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
    if (!currentId) issues.push(vamIssue_(record, 'Info', 'Drive File ID Suggestion', idField, 'Drive Link contains a parseable file ID, but Drive File ID is blank.', parsedId, 'Drive Upload'));
    if (currentId && currentId !== parsedId) issues.push(vamIssue_(record, 'Warning', 'Drive File ID Mismatch', idField, 'Drive File ID does not match the ID parsed from Drive Link.', 'Review exact file mapping. Parsed ID: ' + parsedId, 'Drive Upload'));
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
    if (original && !canonical && suggestion) issues.push(vamIssue_(record, 'Info', 'Canonical Filename Suggestion', canonicalField, 'Canonical Filename is blank and can be derived from Original Filename.', suggestion, 'Metadata'));
  });
  return issues;
}

function vamValidateDuplicateAssetIds_(context) {
  const issues = [];
  const fieldName = VAM_GOV_CONFIG.fields.assetId;
  const groups = {};
  if (!vamHasHeader_(context.headerMap, fieldName)) return issues;
  context.records.forEach(function(record) {
    const assetId = vamClean_(record.values[fieldName]);
    if (!assetId) return;
    const key = vamCompare_(assetId);
    groups[key] = groups[key] || [];
    groups[key].push(record);
  });
  Object.keys(groups).forEach(function(key) {
    if (groups[key].length < 2) return;
    const rows = groups[key].map(function(record) { return record.rowNumber; }).join(', ');
    groups[key].forEach(function(record) {
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
    VAM_GOV_CONFIG.stageGates.forEach(function(stage) {
      const applies = stage.nextSteps.some(function(step) { return vamCompare_(step) === vamCompare_(nextStep); });
      if (!applies) return;
      const missing = stage.requiredFields.filter(function(fieldName) {
        return vamHasHeader_(context.headerMap, fieldName) && !vamClean_(record.values[fieldName]);
      });
      if (missing.length) issues.push(vamIssue_(record, 'Warning', 'Blocked From Advancing', nextStepField, 'Row is marked for "' + nextStep + '" but is missing stage fields: ' + missing.join(', ') + '.', 'Review lifecycle gate before advancing.', stage.name));
    });
  });
  return issues;
}

function vamWriteValidationDashboard_(report) {
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  let sheet = ss.getSheetByName(VAM_GOV_CONFIG.dashboardSheetName);
  if (!sheet) sheet = ss.insertSheet(VAM_GOV_CONFIG.dashboardSheetName);
  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();
  sheet.getDataRange().breakApart();
  sheet.clear();

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

  const headers = ['Row', 'Asset ID', 'Severity', 'Category', 'Field', 'Workflow Stage', 'Message', 'Suggestion'];
  const rows = report.issues.length ? report.issues.map(function(issue) {
    return [issue.rowNumber, issue.assetId, issue.severity, issue.category, issue.fieldName, issue.stage, issue.message, issue.suggestion];
  }) : [['', '', 'Info', 'No Issues Found', '', '', 'No warning-only validation issues were found during this run.', '']];
  sheet.getRange(17, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(18, 1, rows.length, headers.length).setValues(rows);
  sheet.setFrozenRows(17);
  sheet.getRange('A1:B1').merge().setFontWeight('bold').setFontSize(14);
  sheet.getRange('A2:A5').setFontWeight('bold');
  sheet.getRange('A7:B7').setFontWeight('bold').setBackground('#d9ead3');
  sheet.getRange('A17:H17').setFontWeight('bold').setBackground('#cfe2f3');
  sheet.getRange(17, 1, rows.length + 1, headers.length).createFilter();
  sheet.autoResizeColumns(1, headers.length);
  sheet.setColumnWidth(7, 420);
  sheet.setColumnWidth(8, 360);
}

function vamSummarizeIssues_(issues) {
  const summary = { missingRequiredFields: 0, invalidStatusValues: 0, duplicateAssetIds: 0, rowsBlockedFromAdvancing: 0, warnings: 0, suggestions: 0, totalIssues: issues.length };
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
  const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /\/document\/d\/([a-zA-Z0-9_-]+)/, /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/, /\/presentation\/d\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/, /^([a-zA-Z0-9_-]{20,})$/];
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match && match[1]) return match[1];
  }
  return '';
}

function vamSuggestCanonicalFilename_(value) {
  return vamClean_(value).replace(/\s+/g, '_').replace(/[^\w.\-()]+/g, '').replace(/_+/g, '_');
}

function vamHeaderMap_(headers) {
  return headers.reduce(function(map, header, index) { if (header) map[header] = index; return map; }, {});
}

function vamRowObject_(headers, row) {
  return headers.reduce(function(values, header, index) { if (header) values[header] = row[index]; return values; }, {});
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

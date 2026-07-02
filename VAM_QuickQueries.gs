/**
 * Read-only quick query functions for Visual Asset Metadata Governance.
 *
 * Every public function in this file can be run directly from Apps Script.
 * They return compact objects/arrays and write only to the execution log.
 */

function getVisualAssetConfigSnapshot() {
  return {
    spreadsheetId: VAM_GOV_CONFIG.spreadsheetId,
    assetSheetName: VAM_GOV_CONFIG.assetSheetName,
    dashboardSheetName: VAM_GOV_CONFIG.dashboardSheetName,
    warningOnly: VAM_GOV_CONFIG.warningOnly === true,
    requiredFieldCount: VAM_GOV_CONFIG.requiredFields.length,
    controlledFieldCount: Object.keys(VAM_GOV_CONFIG.controlledValues).length,
    workflowStageCount: VAM_GOV_CONFIG.workflowStages.length,
    multiSelectControlledFields: VAM_GOV_CONFIG.multiSelectControlledFields.slice()
  };
}

function getVisualAssetHeaderHealth() {
  const context = vamQuickReadRawHeaderContext_();
  const configuredHeaders = vamQuickConfiguredHeaders_();
  const duplicateHeaders = vamQuickFindDuplicateHeaders_(context.headers);
  const missingHeaders = configuredHeaders.filter(function(header) {
    return !vamHasHeader_(context.headerMap, header);
  });
  const blankHeaderCount = context.headers.filter(function(header) { return !header; }).length;
  const unconfiguredHeaders = context.headers.filter(function(header) {
    return header && configuredHeaders.indexOf(header) === -1;
  });
  return {
    sheetHeaderCount: context.headers.filter(Boolean).length,
    configuredHeaderCount: configuredHeaders.length,
    missingConfiguredHeaderCount: missingHeaders.length,
    duplicateHeaderCount: duplicateHeaders.length,
    blankHeaderCount: blankHeaderCount,
    firstTenHeaders: context.headers.slice(0, 10),
    missingConfiguredHeaders: missingHeaders,
    duplicateHeaders: duplicateHeaders,
    unconfiguredHeaders: unconfiguredHeaders.slice(0, 50)
  };
}

function getVisualAssetMissingConfiguredHeaders() {
  return getVisualAssetHeaderHealth().missingConfiguredHeaders;
}

function getVisualAssetDuplicateHeaders() {
  return vamQuickFindDuplicateHeaders_(vamQuickReadRawHeaderContext_().headers);
}

function getVisualAssetRowCountSummary() {
  const context = vamQuickReadRawHeaderContext_();
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(VAM_GOV_CONFIG.assetSheetName);
  if (!sheet) throw new Error('Missing asset sheet: ' + VAM_GOV_CONFIG.assetSheetName);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  let nonEmptyRecords = 0;
  if (lastRow >= VAM_GOV_CONFIG.firstDataRow && lastColumn > 0) {
    sheet
      .getRange(VAM_GOV_CONFIG.firstDataRow, 1, lastRow - VAM_GOV_CONFIG.firstDataRow + 1, lastColumn)
      .getValues()
      .forEach(function(row) {
        if (row.some(function(value) { return vamClean_(value) !== ''; })) nonEmptyRecords++;
      });
  }
  return {
    firstDataRow: VAM_GOV_CONFIG.firstDataRow,
    nonEmptyRecords: nonEmptyRecords,
    headerCount: context.headers.filter(Boolean).length,
    lastScannedRow: lastRow,
    assetRowsChanged: 0
  };
}

function vamQuickReadRawHeaderContext_() {
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(VAM_GOV_CONFIG.assetSheetName);
  if (!sheet) throw new Error('Missing asset sheet: ' + VAM_GOV_CONFIG.assetSheetName);
  const lastColumn = sheet.getLastColumn();
  const headers = lastColumn
    ? sheet.getRange(VAM_GOV_CONFIG.headerRow, 1, 1, lastColumn).getDisplayValues()[0].map(vamClean_)
    : [];
  return {
    headers: headers,
    headerMap: headers.reduce(function(map, header, index) {
      if (header && !Object.prototype.hasOwnProperty.call(map, header)) map[header] = index;
      return map;
    }, {})
  };
}

function vamQuickFindDuplicateHeaders_(headers) {
  const seen = {};
  const duplicates = {};
  headers.forEach(function(header, index) {
    const key = vamCompare_(header);
    if (!key) return;
    if (!seen[key]) {
      seen[key] = [{ header: header, column: index + 1 }];
      return;
    }
    seen[key].push({ header: header, column: index + 1 });
    duplicates[key] = seen[key];
  });
  return Object.keys(duplicates).map(function(key) {
    return {
      header: duplicates[key][0].header,
      columns: duplicates[key].map(function(item) { return item.column; }).join(', '),
      count: duplicates[key].length
    };
  });
}

function getVisualAssetEmptyRowSample() {
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  const sheet = ss.getSheetByName(VAM_GOV_CONFIG.assetSheetName);
  if (!sheet) throw new Error('Missing asset sheet: ' + VAM_GOV_CONFIG.assetSheetName);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < VAM_GOV_CONFIG.firstDataRow || lastColumn < 1) return [];
  return sheet
    .getRange(VAM_GOV_CONFIG.firstDataRow, 1, lastRow - VAM_GOV_CONFIG.firstDataRow + 1, lastColumn)
    .getValues()
    .map(function(row, index) {
      return {
        rowNumber: VAM_GOV_CONFIG.firstDataRow + index,
        isEmpty: row.every(function(value) { return vamClean_(value) === ''; })
      };
    })
    .filter(function(item) { return item.isEmpty; })
    .slice(0, 25);
}

function getVisualAssetMissingRequiredFieldSummary() {
  return vamQuickGroupIssues_(buildVisualAssetValidationReport().issues, 'Missing Required Field', function(issue) {
    return issue.fieldName || 'Unknown Field';
  });
}

function getVisualAssetInvalidControlledValueSummary() {
  return vamQuickGroupIssues_(buildVisualAssetValidationReport().issues, 'Invalid Controlled Value', function(issue) {
    return issue.fieldName || 'Unknown Field';
  });
}

function getVisualAssetControlledValueCoverage() {
  const context = vamReadAssetRows_();
  return Object.keys(VAM_GOV_CONFIG.controlledValues).map(function(fieldName) {
    const values = {};
    if (vamHasHeader_(context.headerMap, fieldName)) {
      context.records.forEach(function(record) {
        const raw = vamClean_(record.values[fieldName]);
        if (!raw) return;
        const selectedValues = vamIsMultiSelectControlledField_(fieldName)
          ? vamSplitControlledValues_(raw)
          : [raw];
        selectedValues.forEach(function(value) {
          const display = vamClean_(value);
          const key = vamCompare_(display);
          values[key] = values[key] || { value: display, count: 0 };
          values[key].count++;
        });
      });
    }
    return {
      fieldName: fieldName,
      headerPresent: vamHasHeader_(context.headerMap, fieldName),
      allowedCount: VAM_GOV_CONFIG.controlledValues[fieldName].length,
      observedDistinctCount: Object.keys(values).length,
      topObservedValues: Object.keys(values)
        .map(function(key) { return values[key]; })
        .sort(function(a, b) { return b.count - a.count; })
        .slice(0, 10)
    };
  });
}

function getVisualAssetAllowedValuesLookup() {
  return Object.keys(VAM_GOV_CONFIG.controlledValues).sort().map(function(fieldName) {
    return {
      fieldName: fieldName,
      allowedValues: VAM_GOV_CONFIG.controlledValues[fieldName].join('; '),
      multiSelect: vamIsMultiSelectControlledField_(fieldName)
    };
  });
}

function getVisualAssetDriveLinkHealth() {
  const context = vamReadAssetRows_();
  const linkField = VAM_GOV_CONFIG.fields.driveLink;
  const idField = VAM_GOV_CONFIG.fields.driveFileId;
  const summary = {
    linkHeaderPresent: vamHasHeader_(context.headerMap, linkField),
    idHeaderPresent: vamHasHeader_(context.headerMap, idField),
    blankDriveLinks: 0,
    parseableDriveLinks: 0,
    unparseableDriveLinks: 0,
    blankFileIdsWithParseableLinks: 0,
    mismatchedFileIds: 0,
    samples: []
  };
  if (!summary.linkHeaderPresent) return summary;
  context.records.forEach(function(record) {
    const driveLink = vamClean_(record.values[linkField]);
    const currentId = summary.idHeaderPresent ? vamClean_(record.values[idField]) : '';
    const parsedId = vamExtractDriveFileId_(driveLink);
    if (!driveLink) {
      summary.blankDriveLinks++;
      return;
    }
    if (parsedId) {
      summary.parseableDriveLinks++;
      if (!currentId && summary.idHeaderPresent) summary.blankFileIdsWithParseableLinks++;
      if (currentId && currentId !== parsedId) summary.mismatchedFileIds++;
    } else {
      summary.unparseableDriveLinks++;
    }
    if (summary.samples.length < 12 && (parsedId || driveLink)) {
      summary.samples.push({
        rowNumber: record.rowNumber,
        assetId: vamClean_(record.values[VAM_GOV_CONFIG.fields.assetId]),
        parsedId: parsedId,
        currentId: currentId,
        status: !parsedId ? 'Unparseable' : (!currentId ? 'ID Blank' : (currentId === parsedId ? 'Matched' : 'Mismatch'))
      });
    }
  });
  return summary;
}

function getVisualAssetCanonicalFilenameQueue() {
  return buildVisualAssetValidationReport().issues
    .filter(function(issue) { return issue.category === 'Canonical Filename Suggestion'; })
    .slice(0, 50);
}

function getVisualAssetFilenameHealth() {
  const context = vamReadAssetRows_();
  const originalField = VAM_GOV_CONFIG.fields.originalFilename;
  const canonicalField = VAM_GOV_CONFIG.fields.canonicalFilename;
  const summary = {
    originalHeaderPresent: vamHasHeader_(context.headerMap, originalField),
    canonicalHeaderPresent: vamHasHeader_(context.headerMap, canonicalField),
    missingOriginalFilename: 0,
    missingCanonicalFilename: 0,
    canonicalSuggestionCount: 0,
    unsafeCanonicalCharacterCount: 0,
    longCanonicalFilenameCount: 0,
    duplicateCanonicalFilenameGroups: []
  };
  const canonicalGroups = {};
  context.records.forEach(function(record) {
    const original = summary.originalHeaderPresent ? vamClean_(record.values[originalField]) : '';
    const canonical = summary.canonicalHeaderPresent ? vamClean_(record.values[canonicalField]) : '';
    if (summary.originalHeaderPresent && !original) summary.missingOriginalFilename++;
    if (summary.canonicalHeaderPresent && !canonical) summary.missingCanonicalFilename++;
    if (original && !canonical && vamSuggestCanonicalFilename_(original)) summary.canonicalSuggestionCount++;
    if (canonical && /[^\w.\-()]/.test(canonical)) summary.unsafeCanonicalCharacterCount++;
    if (canonical.length > 120) summary.longCanonicalFilenameCount++;
    if (canonical) {
      const key = vamCompare_(canonical);
      canonicalGroups[key] = canonicalGroups[key] || { filename: canonical, rows: [] };
      canonicalGroups[key].rows.push(record.rowNumber);
    }
  });
  summary.duplicateCanonicalFilenameGroups = Object.keys(canonicalGroups)
    .map(function(key) { return canonicalGroups[key]; })
    .filter(function(group) { return group.rows.length > 1; })
    .slice(0, 20)
    .map(function(group) {
      return {
        filename: group.filename,
        count: group.rows.length,
        rows: group.rows.join(', ')
      };
    });
  return summary;
}

function getVisualAssetDuplicateRiskSummary() {
  return {
    duplicateAssetIdGroups: getVisualAssetDuplicateAssetIdGroups(),
    duplicateCanonicalFilenameGroups: getVisualAssetFilenameHealth().duplicateCanonicalFilenameGroups
  };
}

function getVisualAssetWorkflowDistribution() {
  return vamQuickGroupRecordsByField_(VAM_GOV_CONFIG.fields.nextWorkflowStep, 50);
}

function getVisualAssetRowsByStatus() {
  return vamQuickGroupRecordsByField_(VAM_GOV_CONFIG.fields.metadataStatus, 50);
}

function getVisualAssetRowsByWorkflowStep() {
  return getVisualAssetWorkflowDistribution();
}

function getVisualAssetRowsByOwner() {
  return vamQuickGroupRecordsByFirstPresentField_(['Review Owner', 'Created By', 'Owner'], 50);
}

function getVisualAssetHumanReviewQueue() {
  const context = vamReadAssetRows_();
  const fieldName = 'Human Review Required';
  if (!vamHasHeader_(context.headerMap, fieldName)) return [];
  return context.records
    .filter(function(record) {
      const value = vamCompare_(record.values[fieldName]);
      return value === 'yes' || value === 'pending' || value === 'needs human review';
    })
    .slice(0, 50)
    .map(function(record) {
      return vamQuickRecordPreview_(record, fieldName, record.values[fieldName]);
    });
}

function getVisualAssetReadyRowsPreview() {
  const report = buildVisualAssetValidationReport();
  const context = vamReadAssetRows_();
  const issueRows = {};
  report.issues.forEach(function(issue) {
    if (issue.rowNumber) issueRows[issue.rowNumber] = true;
  });
  return context.records
    .filter(function(record) { return !issueRows[record.rowNumber]; })
    .slice(0, 50)
    .map(function(record) {
      return vamQuickRecordPreview_(record, VAM_GOV_CONFIG.fields.metadataStatus, record.values[VAM_GOV_CONFIG.fields.metadataStatus]);
    });
}

function getVisualAssetBlockedRows() {
  return buildVisualAssetValidationReport().issues
    .filter(function(issue) { return issue.category === 'Blocked From Advancing'; })
    .slice(0, 50);
}

function getVisualAssetSchemaHealth() {
  const headerHealth = getVisualAssetHeaderHealth();
  return {
    readyForValidation: headerHealth.duplicateHeaderCount === 0,
    missingConfiguredHeaderCount: headerHealth.missingConfiguredHeaderCount,
    duplicateHeaderCount: headerHealth.duplicateHeaderCount,
    configuredRequiredFieldCount: VAM_GOV_CONFIG.requiredFields.length,
    configuredControlledFieldCount: Object.keys(VAM_GOV_CONFIG.controlledValues).length,
    configuredWorkflowStageCount: VAM_GOV_CONFIG.workflowStages.length,
    warningOnly: VAM_GOV_CONFIG.warningOnly === true
  };
}

function getVisualAssetDataQualitySummary() {
  const report = buildVisualAssetValidationReport();
  return {
    generatedAt: report.generatedAt,
    rowCount: report.rowCount,
    summary: report.summary,
    topFixes: report.topFixes,
    statusSummary: report.statusSummary,
    driveLinkHealth: getVisualAssetDriveLinkHealth(),
    filenameHealth: getVisualAssetFilenameHealth()
  };
}

function getVisualAssetDashboardTargetHealth() {
  const ss = SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  const assetSheet = ss.getSheetByName(VAM_GOV_CONFIG.assetSheetName);
  const dashboardSheet = ss.getSheetByName(VAM_GOV_CONFIG.dashboardSheetName);
  return {
    configuredDashboardName: VAM_GOV_CONFIG.dashboardSheetName,
    configuredAssetName: VAM_GOV_CONFIG.assetSheetName,
    assetSheetExists: !!assetSheet,
    dashboardSheetExists: !!dashboardSheet,
    sameConfiguredName: vamCompare_(VAM_GOV_CONFIG.dashboardSheetName) === vamCompare_(VAM_GOV_CONFIG.assetSheetName),
    sameResolvedSheet: !!(assetSheet && dashboardSheet && assetSheet === dashboardSheet),
    safeToWriteDashboard: !!dashboardSheet
      ? !(assetSheet && dashboardSheet && assetSheet === dashboardSheet)
      : vamCompare_(VAM_GOV_CONFIG.dashboardSheetName) !== vamCompare_(VAM_GOV_CONFIG.assetSheetName)
  };
}

function vamQuickConfiguredHeaders_() {
  const headers = [];
  function pushHeader(header) {
    const cleaned = vamClean_(header);
    if (cleaned && headers.indexOf(cleaned) === -1) headers.push(cleaned);
  }
  Object.keys(VAM_GOV_CONFIG.fields).forEach(function(key) {
    pushHeader(VAM_GOV_CONFIG.fields[key]);
  });
  VAM_GOV_CONFIG.requiredFields.forEach(pushHeader);
  Object.keys(VAM_GOV_CONFIG.controlledValues).forEach(pushHeader);
  VAM_GOV_CONFIG.workflowStages.forEach(function(stage) {
    stage.requiredFields.forEach(pushHeader);
  });
  return headers.sort();
}

function vamQuickGroupIssues_(issues, category, keyFn) {
  const groups = {};
  issues
    .filter(function(issue) { return issue.category === category; })
    .forEach(function(issue) {
      const key = keyFn(issue);
      groups[key] = groups[key] || {
        key: key,
        count: 0,
        sampleRows: [],
        sampleAssetIds: [],
        suggestion: issue.suggestion || ''
      };
      groups[key].count++;
      if (issue.rowNumber && groups[key].sampleRows.length < 10) groups[key].sampleRows.push(issue.rowNumber);
      if (issue.assetId && groups[key].sampleAssetIds.length < 5) groups[key].sampleAssetIds.push(issue.assetId);
    });
  return Object.keys(groups)
    .map(function(key) {
      const group = groups[key];
      return {
        fieldName: group.key,
        count: group.count,
        sampleRows: group.sampleRows.join(', '),
        sampleAssetIds: group.sampleAssetIds.join(', '),
        suggestion: group.suggestion
      };
    })
    .sort(function(a, b) { return b.count - a.count; });
}

function vamQuickGroupRecordsByField_(fieldName, limit) {
  return vamQuickGroupRecordsByFirstPresentField_([fieldName], limit);
}

function vamQuickGroupRecordsByFirstPresentField_(fieldNames, limit) {
  const context = vamReadAssetRows_();
  const fieldName = fieldNames.filter(function(name) {
    return vamHasHeader_(context.headerMap, name);
  })[0] || '';
  if (!fieldName) {
    return [{ value: 'Column not found', count: 0, sampleRows: '', fieldName: fieldNames.join(' / ') }];
  }
  const groups = {};
  context.records.forEach(function(record) {
    const value = vamClean_(record.values[fieldName]) || '(blank)';
    const key = vamCompare_(value);
    groups[key] = groups[key] || { value: value, count: 0, sampleRows: [], fieldName: fieldName };
    groups[key].count++;
    if (groups[key].sampleRows.length < 10) groups[key].sampleRows.push(record.rowNumber);
  });
  return Object.keys(groups)
    .map(function(key) {
      return {
        fieldName: groups[key].fieldName,
        value: groups[key].value,
        count: groups[key].count,
        sampleRows: groups[key].sampleRows.join(', ')
      };
    })
    .sort(function(a, b) { return b.count - a.count; })
    .slice(0, limit || 50);
}

function vamQuickRecordPreview_(record, statusField, statusValue) {
  return {
    rowNumber: record.rowNumber,
    assetId: vamClean_(record.values[VAM_GOV_CONFIG.fields.assetId]),
    assetName: vamClean_(record.values[VAM_GOV_CONFIG.fields.assetName]),
    statusField: statusField,
    statusValue: vamClean_(statusValue),
    nextWorkflowStep: vamClean_(record.values[VAM_GOV_CONFIG.fields.nextWorkflowStep])
  };
}

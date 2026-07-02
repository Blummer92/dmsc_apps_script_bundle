/**
 * Quick smoke tests for Visual Asset Metadata Governance.
 *
 * These tests are meant to be selected one-at-a-time in Apps Script.
 * They log compact PASS/FAIL-style output to the execution log.
 */

function runVisualAssetQuickSmokeTests() {
  vamStartRun_();
  vamQuickLog_('QUICK_SMOKE_START', {
    assetRowsChanged: 0,
    dashboardRowsChanged: 0,
    mode: 'shared snapshot'
  });
  const snapshot = vamQuickBuildSmokeSnapshot_();
  const results = [
    vamQuickRunTest_('config.snapshot', getVisualAssetConfigSnapshot),
    vamQuickRunTest_('headers.health', function() { return vamQuickBuildHeaderHealthFromSnapshot_(snapshot); }),
    vamQuickRunTest_('rows.count', function() { return vamQuickBuildRowCountFromSnapshot_(snapshot); }),
    vamQuickRunTest_('required.summary', function() { return vamQuickBuildMissingRequiredFromSnapshot_(snapshot); }),
    vamQuickRunTest_('controlled.summary', function() { return vamQuickBuildInvalidControlledFromSnapshot_(snapshot); }),
    vamQuickRunTest_('drive.health', function() { return vamQuickBuildDriveHealthFromSnapshot_(snapshot); }),
    vamQuickRunTest_('filename.health', function() { return vamQuickBuildFilenameHealthFromSnapshot_(snapshot); }),
    vamQuickRunTest_('duplicates.assets', function() { return vamQuickBuildDuplicateRiskFromSnapshot_(snapshot); }),
    vamQuickRunTest_('workflow.distribution', function() { return vamQuickGroupSnapshotRecordsByField_(snapshot, VAM_GOV_CONFIG.fields.nextWorkflowStep, 50); }),
    vamQuickRunTest_('workflow.blockers', function() { return snapshot.report.workflowBlockerSummary; }),
    vamQuickRunTest_('status.distribution', function() { return vamQuickGroupSnapshotRecordsByField_(snapshot, VAM_GOV_CONFIG.fields.metadataStatus, 50); }),
    vamQuickRunTest_('human.review', function() { return vamQuickBuildHumanReviewQueueFromSnapshot_(snapshot); }),
    vamQuickRunTest_('ready.preview', function() { return vamQuickBuildReadyRowsFromSnapshot_(snapshot); }),
    vamQuickRunTest_('schema.health', function() { return vamQuickBuildSchemaHealthFromSnapshot_(snapshot); }),
    vamQuickRunTest_('dashboard.guard', getVisualAssetDashboardTargetHealth)
  ];
  const failed = results.filter(function(result) { return result.status !== 'PASS'; });
  vamQuickLog_('QUICK_SMOKE_COMPLETE', {
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    assetRowsChanged: 0,
    dashboardRowsChanged: 0
  });
  return results;
}

function testVamConfigSnapshot() {
  return vamQuickLogResult_('config.snapshot', getVisualAssetConfigSnapshot());
}

function testVamHeaderHealth() {
  return vamQuickLogResult_('headers.health', getVisualAssetHeaderHealth());
}

function testVamMissingConfiguredHeaders() {
  return vamQuickLogResult_('headers.missing', getVisualAssetMissingConfiguredHeaders());
}

function testVamDuplicateHeaderCheck() {
  return vamQuickLogResult_('headers.duplicates', getVisualAssetDuplicateHeaders());
}

function testVamRowCountOnly() {
  return vamQuickLogResult_('rows.count', getVisualAssetRowCountSummary());
}

function testVamEmptyRowScan() {
  return vamQuickLogResult_('rows.empty', getVisualAssetEmptyRowSample());
}

function testVamMissingRequiredFieldSummary() {
  return vamQuickLogResult_('required.summary', getVisualAssetMissingRequiredFieldSummary());
}

function testVamInvalidControlledValueSummary() {
  return vamQuickLogResult_('controlled.summary', getVisualAssetInvalidControlledValueSummary());
}

function testVamControlledValueCoverage() {
  return vamQuickLogResult_('controlled.coverage', getVisualAssetControlledValueCoverage());
}

function testVamAllowedValuesLookup() {
  return vamQuickLogResult_('controlled.allowed', getVisualAssetAllowedValuesLookup());
}

function testVamDriveLinkHealth() {
  return vamQuickLogResult_('drive.health', getVisualAssetDriveLinkHealth());
}

function testVamDriveFileIdQueue() {
  return vamQuickLogResult_('drive.queue', getVisualAssetDriveFileIdReviewQueue());
}

function testVamCanonicalFilenameQueue() {
  return vamQuickLogResult_('filename.queue', getVisualAssetCanonicalFilenameQueue());
}

function testVamFilenameHealth() {
  return vamQuickLogResult_('filename.health', getVisualAssetFilenameHealth());
}

function testVamDuplicateAssetIds() {
  return vamQuickLogResult_('duplicates.assets', getVisualAssetDuplicateRiskSummary());
}

function testVamWorkflowDistribution() {
  return vamQuickLogResult_('workflow.distribution', getVisualAssetWorkflowDistribution());
}

function testVamWorkflowBlockers() {
  return vamQuickLogResult_('workflow.blockers', getVisualAssetWorkflowBlockers());
}

function testVamRowsByStatus() {
  return vamQuickLogResult_('status.distribution', getVisualAssetRowsByStatus());
}

function testVamRowsByOwner() {
  return vamQuickLogResult_('owner.review', getVisualAssetRowsByOwner());
}

function testVamHumanReviewQueue() {
  return vamQuickLogResult_('human.review', getVisualAssetHumanReviewQueue());
}

function testVamReadyRowsPreview() {
  return vamQuickLogResult_('ready.preview', getVisualAssetReadyRowsPreview());
}

function testVamBlockedRows() {
  return vamQuickLogResult_('workflow.blockedRows', getVisualAssetBlockedRows());
}

function testVamSchemaHealth() {
  return vamQuickLogResult_('schema.health', getVisualAssetSchemaHealth());
}

function testVamDataQualitySummary() {
  return vamQuickLogResult_('quality.summary', getVisualAssetDataQualitySummary());
}

function testVamPreviousRunComparison() {
  return vamQuickLogResult_('run.compare', getVisualAssetPreviousRunComparison());
}

function testVamSaveRunSummary() {
  return vamQuickLogResult_('run.saveSummary', saveVisualAssetLastValidationSummary());
}

function testVamFeatureFlags() {
  return vamQuickLogResult_('properties.flags', getVisualAssetFeatureFlags());
}

function testVamDashboardTargetGuard() {
  return vamQuickLogResult_('dashboard.guard', getVisualAssetDashboardTargetHealth());
}

function testVamQuickFeatureCatalog() {
  return vamQuickLogResult_('features.catalog', getVisualAssetQuickFeatureCatalog());
}

function vamQuickRunTest_(featureId, callback) {
  try {
    const result = callback();
    const summary = vamQuickSummarizeResult_(result);
    vamQuickLog_('TEST_PASS', {
      featureId: featureId,
      summary: summary,
      assetRowsChanged: 0
    });
    return {
      featureId: featureId,
      status: 'PASS',
      summary: summary
    };
  } catch (error) {
    vamQuickLog_('TEST_FAIL', {
      featureId: featureId,
      message: error.message,
      assetRowsChanged: 0
    });
    return {
      featureId: featureId,
      status: 'FAIL',
      message: error.message
    };
  }
}

function vamQuickLogResult_(featureId, result) {
  vamQuickLog_('FEATURE_RESULT', {
    featureId: featureId,
    summary: vamQuickSummarizeResult_(result),
    assetRowsChanged: 0
  });
  return result;
}

function vamQuickSummarizeResult_(result) {
  if (Array.isArray(result)) {
    return {
      type: 'array',
      count: result.length,
      firstItem: result.length ? result[0] : null
    };
  }
  if (result && typeof result === 'object') {
    const keys = Object.keys(result);
    const summary = {
      type: 'object',
      keyCount: keys.length,
      keys: keys.slice(0, 12)
    };
    ['rowCount', 'nonEmptyRecords', 'totalIssues', 'warnings', 'suggestions', 'missingConfiguredHeaderCount', 'duplicateHeaderCount'].forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(result, key)) summary[key] = result[key];
    });
    if (result.summary && typeof result.summary === 'object') {
      summary.reportSummary = result.summary;
    }
    return summary;
  }
  return {
    type: typeof result,
    value: result
  };
}

function vamQuickBuildSmokeSnapshot_() {
  const context = vamReadAssetRows_();
  const issues = [];
  Array.prototype.push.apply(issues, vamValidateMissingRequiredFields_(context));
  Array.prototype.push.apply(issues, vamValidateControlledValues_(context));
  Array.prototype.push.apply(issues, vamValidateDriveFileIds_(context));
  Array.prototype.push.apply(issues, vamValidateCanonicalFilenames_(context));
  Array.prototype.push.apply(issues, vamValidateDuplicateAssetIds_(context));
  Array.prototype.push.apply(issues, vamValidateWorkflowStages_(context));
  const report = {
    generatedAt: Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    rowCount: context.records.length,
    warningOnly: true,
    issues: issues,
    summary: vamSummarizeIssues_(issues),
    topFixes: vamBuildTopFixes_(issues, 5),
    statusSummary: vamBuildStatusSummary_(context),
    driveFileReviewQueue: vamBuildDriveFileReviewQueue_(issues, 10),
    duplicateAssetIdGroups: vamBuildDuplicateAssetIdGroups_(context, 10),
    workflowBlockerSummary: vamBuildWorkflowBlockerSummary_(issues, 10)
  };
  vamQuickLog_('SMOKE_SNAPSHOT_BUILT', {
    rowCount: report.rowCount,
    totalIssues: report.summary.totalIssues,
    warningOnly: report.warningOnly,
    readCount: 1,
    assetRowsChanged: 0
  });
  return {
    context: context,
    report: report
  };
}

function vamQuickBuildHeaderHealthFromSnapshot_(snapshot) {
  const context = snapshot.context;
  const configuredHeaders = vamQuickConfiguredHeaders_();
  const duplicateHeaders = vamQuickFindDuplicateHeaders_(context.headers);
  const missingHeaders = configuredHeaders.filter(function(header) {
    return !vamHasHeader_(context.headerMap, header);
  });
  return {
    sheetHeaderCount: context.headers.filter(Boolean).length,
    configuredHeaderCount: configuredHeaders.length,
    missingConfiguredHeaderCount: missingHeaders.length,
    duplicateHeaderCount: duplicateHeaders.length,
    blankHeaderCount: context.headers.filter(function(header) { return !header; }).length,
    firstTenHeaders: context.headers.slice(0, 10),
    missingConfiguredHeaders: missingHeaders,
    duplicateHeaders: duplicateHeaders
  };
}

function vamQuickBuildRowCountFromSnapshot_(snapshot) {
  const records = snapshot.context.records;
  return {
    firstDataRow: VAM_GOV_CONFIG.firstDataRow,
    nonEmptyRecords: records.length,
    headerCount: snapshot.context.headers.filter(Boolean).length,
    lastScannedRow: records.length ? records[records.length - 1].rowNumber : '',
    assetRowsChanged: 0
  };
}

function vamQuickBuildMissingRequiredFromSnapshot_(snapshot) {
  return vamQuickGroupIssues_(snapshot.report.issues, 'Missing Required Field', function(issue) {
    return issue.fieldName || 'Unknown Field';
  });
}

function vamQuickBuildInvalidControlledFromSnapshot_(snapshot) {
  return vamQuickGroupIssues_(snapshot.report.issues, 'Invalid Controlled Value', function(issue) {
    return issue.fieldName || 'Unknown Field';
  });
}

function vamQuickBuildDriveHealthFromSnapshot_(snapshot) {
  const context = snapshot.context;
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

function vamQuickBuildFilenameHealthFromSnapshot_(snapshot) {
  const context = snapshot.context;
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

function vamQuickBuildDuplicateRiskFromSnapshot_(snapshot) {
  return {
    duplicateAssetIdGroups: snapshot.report.duplicateAssetIdGroups,
    duplicateCanonicalFilenameGroups: vamQuickBuildFilenameHealthFromSnapshot_(snapshot).duplicateCanonicalFilenameGroups
  };
}

function vamQuickGroupSnapshotRecordsByField_(snapshot, fieldName, limit) {
  const context = snapshot.context;
  if (!vamHasHeader_(context.headerMap, fieldName)) {
    return [{ value: 'Column not found', count: 0, sampleRows: '', fieldName: fieldName }];
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

function vamQuickBuildHumanReviewQueueFromSnapshot_(snapshot) {
  const context = snapshot.context;
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

function vamQuickBuildReadyRowsFromSnapshot_(snapshot) {
  const issueRows = {};
  snapshot.report.issues.forEach(function(issue) {
    if (issue.rowNumber) issueRows[issue.rowNumber] = true;
  });
  return snapshot.context.records
    .filter(function(record) { return !issueRows[record.rowNumber]; })
    .slice(0, 50)
    .map(function(record) {
      return vamQuickRecordPreview_(record, VAM_GOV_CONFIG.fields.metadataStatus, record.values[VAM_GOV_CONFIG.fields.metadataStatus]);
    });
}

function vamQuickBuildSchemaHealthFromSnapshot_(snapshot) {
  const headerHealth = vamQuickBuildHeaderHealthFromSnapshot_(snapshot);
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

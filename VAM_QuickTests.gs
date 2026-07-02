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
    dashboardRowsChanged: 0
  });
  const results = [
    vamQuickRunTest_('config.snapshot', getVisualAssetConfigSnapshot),
    vamQuickRunTest_('headers.health', getVisualAssetHeaderHealth),
    vamQuickRunTest_('rows.count', getVisualAssetRowCountSummary),
    vamQuickRunTest_('required.summary', getVisualAssetMissingRequiredFieldSummary),
    vamQuickRunTest_('controlled.summary', getVisualAssetInvalidControlledValueSummary),
    vamQuickRunTest_('drive.health', getVisualAssetDriveLinkHealth),
    vamQuickRunTest_('filename.health', getVisualAssetFilenameHealth),
    vamQuickRunTest_('duplicates.assets', getVisualAssetDuplicateRiskSummary),
    vamQuickRunTest_('workflow.distribution', getVisualAssetWorkflowDistribution),
    vamQuickRunTest_('workflow.blockers', getVisualAssetWorkflowBlockers),
    vamQuickRunTest_('status.distribution', getVisualAssetRowsByStatus),
    vamQuickRunTest_('human.review', getVisualAssetHumanReviewQueue),
    vamQuickRunTest_('ready.preview', getVisualAssetReadyRowsPreview),
    vamQuickRunTest_('schema.health', getVisualAssetSchemaHealth),
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

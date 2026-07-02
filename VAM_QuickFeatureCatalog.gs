/**
 * Quick-test feature catalog for Visual Asset Metadata Governance.
 *
 * These functions are intentionally independent from workflow enforcement.
 * They make it easy to run one small feature at a time from Apps Script.
 */

const VAM_QUICK_FEATURES = Object.freeze([
  Object.freeze({ id: 'config.snapshot', name: 'Config Snapshot', testFunction: 'testVamConfigSnapshot', dataFunction: 'getVisualAssetConfigSnapshot', writes: 'none' }),
  Object.freeze({ id: 'headers.health', name: 'Header Health', testFunction: 'testVamHeaderHealth', dataFunction: 'getVisualAssetHeaderHealth', writes: 'none' }),
  Object.freeze({ id: 'headers.missing', name: 'Missing Configured Headers', testFunction: 'testVamMissingConfiguredHeaders', dataFunction: 'getVisualAssetMissingConfiguredHeaders', writes: 'none' }),
  Object.freeze({ id: 'headers.duplicates', name: 'Duplicate Header Check', testFunction: 'testVamDuplicateHeaderCheck', dataFunction: 'getVisualAssetDuplicateHeaders', writes: 'none' }),
  Object.freeze({ id: 'rows.count', name: 'Row Count Check', testFunction: 'testVamRowCountOnly', dataFunction: 'getVisualAssetRowCountSummary', writes: 'none' }),
  Object.freeze({ id: 'rows.empty', name: 'Empty Row Sample', testFunction: 'testVamEmptyRowScan', dataFunction: 'getVisualAssetEmptyRowSample', writes: 'none' }),
  Object.freeze({ id: 'required.summary', name: 'Missing Required Field Summary', testFunction: 'testVamMissingRequiredFieldSummary', dataFunction: 'getVisualAssetMissingRequiredFieldSummary', writes: 'none' }),
  Object.freeze({ id: 'controlled.summary', name: 'Invalid Controlled Value Summary', testFunction: 'testVamInvalidControlledValueSummary', dataFunction: 'getVisualAssetInvalidControlledValueSummary', writes: 'none' }),
  Object.freeze({ id: 'controlled.coverage', name: 'Controlled Value Coverage', testFunction: 'testVamControlledValueCoverage', dataFunction: 'getVisualAssetControlledValueCoverage', writes: 'none' }),
  Object.freeze({ id: 'controlled.allowed', name: 'Allowed Values Lookup', testFunction: 'testVamAllowedValuesLookup', dataFunction: 'getVisualAssetAllowedValuesLookup', writes: 'none' }),
  Object.freeze({ id: 'drive.health', name: 'Drive Link Health', testFunction: 'testVamDriveLinkHealth', dataFunction: 'getVisualAssetDriveLinkHealth', writes: 'none' }),
  Object.freeze({ id: 'drive.queue', name: 'Drive File ID Review Queue', testFunction: 'testVamDriveFileIdQueue', dataFunction: 'getVisualAssetDriveFileIdReviewQueue', writes: 'none' }),
  Object.freeze({ id: 'filename.health', name: 'Filename Health', testFunction: 'testVamFilenameHealth', dataFunction: 'getVisualAssetFilenameHealth', writes: 'none' }),
  Object.freeze({ id: 'filename.queue', name: 'Canonical Filename Queue', testFunction: 'testVamCanonicalFilenameQueue', dataFunction: 'getVisualAssetCanonicalFilenameQueue', writes: 'none' }),
  Object.freeze({ id: 'duplicates.assets', name: 'Duplicate Asset ID Groups', testFunction: 'testVamDuplicateAssetIds', dataFunction: 'getVisualAssetDuplicateRiskSummary', writes: 'none' }),
  Object.freeze({ id: 'workflow.distribution', name: 'Workflow Distribution', testFunction: 'testVamWorkflowDistribution', dataFunction: 'getVisualAssetWorkflowDistribution', writes: 'none' }),
  Object.freeze({ id: 'workflow.blockers', name: 'Workflow Blocker Summary', testFunction: 'testVamWorkflowBlockers', dataFunction: 'getVisualAssetWorkflowBlockers', writes: 'none' }),
  Object.freeze({ id: 'status.distribution', name: 'Metadata Status Distribution', testFunction: 'testVamRowsByStatus', dataFunction: 'getVisualAssetRowsByStatus', writes: 'none' }),
  Object.freeze({ id: 'owner.review', name: 'Review Owner Distribution', testFunction: 'testVamRowsByOwner', dataFunction: 'getVisualAssetRowsByOwner', writes: 'none' }),
  Object.freeze({ id: 'human.review', name: 'Human Review Queue', testFunction: 'testVamHumanReviewQueue', dataFunction: 'getVisualAssetHumanReviewQueue', writes: 'none' }),
  Object.freeze({ id: 'ready.preview', name: 'Ready Rows Preview', testFunction: 'testVamReadyRowsPreview', dataFunction: 'getVisualAssetReadyRowsPreview', writes: 'none' }),
  Object.freeze({ id: 'schema.health', name: 'Schema Health Summary', testFunction: 'testVamSchemaHealth', dataFunction: 'getVisualAssetSchemaHealth', writes: 'none' }),
  Object.freeze({ id: 'quality.summary', name: 'Data Quality Summary', testFunction: 'testVamDataQualitySummary', dataFunction: 'getVisualAssetDataQualitySummary', writes: 'none' }),
  Object.freeze({ id: 'run.compare', name: 'Previous Run Comparison', testFunction: 'testVamPreviousRunComparison', dataFunction: 'getVisualAssetPreviousRunComparison', writes: 'properties only' }),
  Object.freeze({ id: 'properties.flags', name: 'Feature Flag Snapshot', testFunction: 'testVamFeatureFlags', dataFunction: 'getVisualAssetFeatureFlags', writes: 'none' }),
  Object.freeze({ id: 'dashboard.guard', name: 'Dashboard Target Guard', testFunction: 'testVamDashboardTargetGuard', dataFunction: 'getVisualAssetDashboardTargetHealth', writes: 'none' }),
  Object.freeze({ id: 'logs.visible', name: 'Execution Log Visibility', testFunction: 'testVisualAssetExecutionLog', dataFunction: 'getVisualAssetQuickFeatureCatalog', writes: 'none' }),
  Object.freeze({ id: 'logs.dashboard', name: 'Dashboard Logging Only', testFunction: 'testVisualAssetDashboardLoggingOnly', dataFunction: 'getVisualAssetQuickFeatureCatalog', writes: 'none' }),
  Object.freeze({ id: 'logs.features', name: 'Feature Dashboard Logging Only', testFunction: 'testVisualAssetFeatureDashboardLoggingOnly', dataFunction: 'getVisualAssetQuickFeatureCatalog', writes: 'none' }),
  Object.freeze({ id: 'smoke.all', name: 'Quick Smoke Test Runner', testFunction: 'runVisualAssetQuickSmokeTests', dataFunction: 'getVisualAssetQuickSmokePlan', writes: 'none' })
]);

function getVisualAssetQuickFeatureCatalog() {
  return VAM_QUICK_FEATURES.map(function(feature, index) {
    return {
      number: index + 1,
      id: feature.id,
      name: feature.name,
      testFunction: feature.testFunction,
      dataFunction: feature.dataFunction,
      writes: feature.writes,
      safeForQuickTesting: feature.writes === 'none' || feature.writes === 'properties only'
    };
  });
}

function getVisualAssetQuickSmokePlan() {
  return getVisualAssetQuickFeatureCatalog().map(function(feature) {
    return {
      id: feature.id,
      runThisFunction: feature.testFunction,
      expectedLogPrefix: '[VAM_QUICK]',
      expectedWriteSurface: feature.writes
    };
  });
}

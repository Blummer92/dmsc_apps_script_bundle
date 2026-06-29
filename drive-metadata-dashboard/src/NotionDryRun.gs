function dryRunNotionRows2To11() {
  return NotionSyncService.dryRunRows2To11();
}

function syncNotionRows2To11ToStaging() {
  return NotionSyncService.syncRows2To11ToStaging();
}

function dryRunNotionEligibleStagingBatch() {
  if (isVisualAssetLibraryTarget_()) {
    return VisualAssetLibraryValidationService.dryRunFieldValidationOnly();
  }
  return NotionSyncService.dryRunEligibleStagingBatch();
}

function syncNotionEligibleStagingBatchToStaging() {
  return NotionSyncService.syncEligibleStagingBatchToStaging();
}

function auditVisualAssetLibrarySync() {
  return NotionSyncService.auditVisualAssetLibrarySync();
}

function dryRunVisualAssetLibraryFieldValidationOnly() {
  return VisualAssetLibraryValidationService.dryRunFieldValidationOnly();
}

function isVisualAssetLibraryTarget_() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('DM_NOTION_STAGING_DATA_SOURCE_ID') === 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
}

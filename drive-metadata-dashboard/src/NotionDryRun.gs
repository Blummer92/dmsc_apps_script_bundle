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
  if (isVisualAssetLibraryTarget_()) {
    return VisualAssetLibraryWriteService.syncEligibleBatch();
  }
  return NotionSyncService.syncEligibleStagingBatchToStaging();
}

function auditVisualAssetLibrarySync() {
  return NotionSyncService.auditVisualAssetLibrarySync();
}

function dryRunVisualAssetLibraryFieldValidationOnly() {
  return VisualAssetLibraryValidationService.dryRunFieldValidationOnly();
}

function getVisualAssetLibrarySyncPanel() {
  const props = PropertiesService.getScriptProperties();
  const startRow = Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2);
  const endRow = Number(props.getProperty('DM_NOTION_SYNC_END_ROW') || 11);
  const cursorRow = Number(props.getProperty('DM_NOTION_SYNC_CURSOR_ROW') || startRow);
  const batchSize = Number(props.getProperty('DM_NOTION_SYNC_BATCH_SIZE') || 25);
  const batchEndRow = Math.min(endRow, cursorRow + batchSize - 1);
  const isVisualTarget = isVisualAssetLibraryTarget_();
  const hasExpandedApproval = props.getProperty('DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED') === 'YES_EXPANDED_STAGING_BATCH_ONLY';
  const hasVisualApproval = props.getProperty('DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED') === 'YES_VISUAL_ASSET_LIBRARY_ONLY';
  const hasGuessedPromptApproval = props.getProperty('DM_VISUAL_ASSET_LIBRARY_ALLOW_GUESSED_PROMPTS') === 'YES_GUESSED_PROMPTS_APPROVED';
  const hasRequiredConfig = Boolean(
    props.getProperty('DM_SOURCE_LIBRARY_SPREADSHEET_ID') &&
    props.getProperty('DM_SOURCE_LIBRARY_SHEET_NAME') &&
    props.getProperty('DM_NOTION_STAGING_DATABASE_URL') &&
    (props.getProperty('DM_NOTION_API_TOKEN') || props.getProperty('NOTION_API_TOKEN'))
  );
  const syncScope = props.getProperty('DM_NOTION_SYNC_SCOPE') || '';
  const ready = isVisualTarget && syncScope === 'ELIGIBLE_STAGING_BATCH' && hasExpandedApproval && hasVisualApproval && hasRequiredConfig;

  return {
    target: isVisualTarget ? 'Visual Asset Library' : 'Not Visual Asset Library',
    ready: ready,
    mode: props.getProperty('DM_NOTION_SYNC_MODE') || 'DRY_RUN',
    sync_scope: syncScope,
    start_row: startRow,
    end_row: endRow,
    cursor_row: cursorRow,
    batch_size: batchSize,
    batch_start_row: cursorRow,
    batch_end_row: batchEndRow,
    next_cursor_row: batchEndRow < endRow ? batchEndRow + 1 : null,
    max_end_row: Number(props.getProperty('DM_NOTION_SYNC_MAX_END_ROW') || 454),
    has_required_config: hasRequiredConfig,
    has_expanded_write_approval: hasExpandedApproval,
    has_visual_asset_library_write_approval: hasVisualApproval,
    guessed_prompts_enabled: hasGuessedPromptApproval,
    title_property: props.getProperty('DM_NOTION_TITLE_PROPERTY') || 'Asset title',
    file_id_property: props.getProperty('DM_NOTION_FILE_ID_PROPERTY') || 'file_id',
    drive_url_property: props.getProperty('DM_NOTION_DRIVE_URL_PROPERTY') || 'Source file link in Google Drive'
  };
}

function validateAndWriteVisualAssetLibraryBatch() {
  if (!isVisualAssetLibraryTarget_()) {
    throw new Error('Blocked: validate-and-write only runs against the approved Visual Asset Library target.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Blocked: another Visual Asset Library sync is already running. Try again after it finishes.');
  }

  const props = PropertiesService.getScriptProperties();
  let validation;
  let writeResult;

  try {
    props.setProperty('DM_NOTION_SYNC_MODE', 'DRY_RUN');
    validation = VisualAssetLibraryValidationService.dryRunFieldValidationOnly();

    props.setProperty('DM_NOTION_SYNC_MODE', 'STAGING_WRITE');
    writeResult = VisualAssetLibraryWriteService.syncEligibleBatch();

    if (writeResult.synced_count !== writeResult.verified_count) {
      throw new Error('Blocked: synced_count and verified_count do not match.');
    }

    if (writeResult.next_cursor_row) {
      props.setProperty('DM_NOTION_SYNC_CURSOR_ROW', String(writeResult.next_cursor_row));
    }

    return {
      ok: true,
      validation_summary: validation.summary,
      write_result: writeResult,
      status: getVisualAssetLibrarySyncPanel()
    };
  } finally {
    props.setProperty('DM_NOTION_SYNC_MODE', 'DRY_RUN');
    lock.releaseLock();
  }
}

function isVisualAssetLibraryTarget_() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('DM_NOTION_STAGING_DATA_SOURCE_ID') === 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
}

function dryRunNotionRows2To11() {
  return NotionSyncService.dryRunRows2To11();
}

function syncNotionRows2To11ToStaging() {
  return NotionSyncService.syncRows2To11ToStaging();
}

function dryRunNotionEligibleStagingBatch() {
  return NotionSyncService.dryRunEligibleStagingBatch();
}

function syncNotionEligibleStagingBatchToStaging() {
  return NotionSyncService.syncEligibleStagingBatchToStaging();
}

function auditVisualAssetLibrarySync() {
  return NotionSyncService.auditVisualAssetLibrarySync();
}

function dryRunVisualAssetLibraryFieldValidationOnly() {
  const originalLog = Logger.log;
  let suppressedServiceLogs = false;
  try {
    Logger.log = function() {};
    suppressedServiceLogs = true;
  } catch (error) {
    suppressedServiceLogs = false;
  }

  let result;
  try {
    result = NotionSyncService.dryRunEligibleStagingBatch();
  } finally {
    if (suppressedServiceLogs) {
      Logger.log = originalLog;
    }
  }

  const validation = result.field_validation || [];
  const compact = validation.map(function(row) {
    return {
      source_row: row.source_row,
      file_id: row.file_id,
      field_name: row.field_name,
      old_value: shortenForLog_(row.old_value),
      proposed_value: shortenForLog_(row.proposed_value),
      source_column_used: row.source_column_used,
      skipped: row.skipped,
      reason: row.reason
    };
  });
  const summary = {
    mode: result.mode,
    sync_scope: result.sync_scope,
    target_data_source_id: result.target_data_source_id,
    batch_start_row: result.batch_start_row,
    batch_end_row: result.batch_end_row,
    next_cursor_row: result.next_cursor_row,
    eligible_payload_count: result.eligible_payload_count,
    field_validation_count: compact.length,
    skipped_field_count: compact.filter(function(row) { return row.skipped; }).length,
    writable_field_count: compact.filter(function(row) { return !row.skipped; }).length
  };

  Logger.log('VISUAL ASSET LIBRARY FIELD VALIDATION ONLY - No Notion write executed.');
  Logger.log(JSON.stringify(summary, null, 2));
  logJsonInChunks_(compact, 6000);
  return {
    summary: summary,
    field_validation: compact
  };
}

function shortenForLog_(value) {
  const text = Array.isArray(value) ? value.join(', ') : String(value === null || value === undefined ? '' : value);
  return text.length > 240 ? text.slice(0, 237) + '...' : text;
}

function logJsonInChunks_(value, chunkSize) {
  const json = JSON.stringify(value, null, 2);
  for (let start = 0; start < json.length; start += chunkSize) {
    const chunkNumber = Math.floor(start / chunkSize) + 1;
    Logger.log('FIELD VALIDATION CHUNK ' + chunkNumber + '\n' + json.slice(start, start + chunkSize));
  }
}

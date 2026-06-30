var VisualAssetLibraryWriteService = (function() {
  const VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
  const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2022-06-28';
  const EXPANDED_SCOPE = 'ELIGIBLE_STAGING_BATCH';
  const EXPANDED_WRITE_APPROVAL_VALUE = 'YES_EXPANDED_STAGING_BATCH_ONLY';
  const VISUAL_ASSET_LIBRARY_WRITE_APPROVAL_VALUE = 'YES_VISUAL_ASSET_LIBRARY_ONLY';
  const DEFAULT_BATCH_SIZE = 25;
  const MAX_BATCH_SIZE = 50;
  const DEFAULT_EXPANDED_MAX_END_ROW = 454;

  function syncEligibleBatch() {
    const context = getContext_();
    validateContext_(context);
    const batch = readBatch_(context);
    const schema = fetchSchema_(context);
    const proof = VisualAssetLibraryDryRunProofService.assertMatches(context, batch, schema);
    const rows = batch.records.map(function(record) { return record.rowNumber; });
    const managerResult = VisualAssetLibraryProductionSyncService.sync(rows);
    const synced = (managerResult.row_progress || []).filter(function(item) { return item.status === 'synced'; });
    const partial = (managerResult.row_progress || []).filter(function(item) { return item.status === 'partial'; });
    const failed = (managerResult.row_progress || []).filter(function(item) { return item.status === 'failed'; });
    const result = {
      mode: context.mode,
      sync_scope: context.syncScope,
      target_data_source_id: context.dataSourceId,
      batch_start_row: batch.startRow,
      batch_end_row: batch.endRow,
      next_cursor_row: batch.nextCursorRow,
      dry_run_proof_saved_at: proof.saved_at,
      read_count: batch.records.length,
      skipped_count: 0,
      skipped: [],
      synced_count: synced.length,
      verified_count: synced.length,
      partial_count: partial.length,
      failed_count: failed.length,
      synced: synced.map(toLegacySyncItem_),
      verified: synced.map(toLegacySyncItem_),
      field_verification: buildFieldVerification_(managerResult.row_progress || []),
      field_skips: buildFieldSkips_(managerResult.row_progress || []),
      manager_summary: managerResult.summary
    };
    if (partial.length || failed.length) {
      throw new Error('Blocked: field-level verification failed after write. Green requires verified metadata. Result: ' + JSON.stringify(result));
    }
    if (result.synced_count !== result.verified_count) {
      throw new Error('Blocked: synced and verified counts do not match. Result: ' + JSON.stringify(result));
    }
    Logger.log('VISUAL ASSET LIBRARY BATCH WRITE COMPLETE - metadata verified by read-back.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  function getContext_() {
    const props = PropertiesService.getScriptProperties();
    const startRow = Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2);
    const endRow = Number(props.getProperty('DM_NOTION_SYNC_END_ROW') || 11);
    return {
      spreadsheetId: props.getProperty('DM_SOURCE_LIBRARY_SPREADSHEET_ID'),
      sheetName: props.getProperty('DM_SOURCE_LIBRARY_SHEET_NAME'),
      dataSourceId: props.getProperty('DM_NOTION_STAGING_DATA_SOURCE_ID'),
      databaseUrl: props.getProperty('DM_NOTION_STAGING_DATABASE_URL'),
      databaseId: props.getProperty('DM_NOTION_STAGING_DATABASE_ID'),
      notionToken: props.getProperty('DM_NOTION_API_TOKEN') || props.getProperty('NOTION_API_TOKEN'),
      expandedWriteApproval: props.getProperty('DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED'),
      visualAssetLibraryWriteApproval: props.getProperty('DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED'),
      startRow: startRow,
      endRow: endRow,
      cursorRow: Number(props.getProperty('DM_NOTION_SYNC_CURSOR_ROW') || startRow),
      maxEndRow: Number(props.getProperty('DM_NOTION_SYNC_MAX_END_ROW') || DEFAULT_EXPANDED_MAX_END_ROW),
      batchSize: Number(props.getProperty('DM_NOTION_SYNC_BATCH_SIZE') || DEFAULT_BATCH_SIZE),
      syncScope: props.getProperty('DM_NOTION_SYNC_SCOPE') || '',
      mode: props.getProperty('DM_NOTION_SYNC_MODE') || 'DRY_RUN'
    };
  }

  function validateContext_(context) {
    if (context.mode !== 'STAGING_WRITE') throw new Error('Blocked: Visual Asset Library sync only runs when DM_NOTION_SYNC_MODE is STAGING_WRITE.');
    if (context.syncScope !== EXPANDED_SCOPE) throw new Error('Blocked: Visual Asset Library sync requires DM_NOTION_SYNC_SCOPE=' + EXPANDED_SCOPE + '.');
    if (context.dataSourceId !== VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID) throw new Error('Blocked: Visual Asset Library sync only runs against approved data source.');
    if (context.expandedWriteApproval !== EXPANDED_WRITE_APPROVAL_VALUE) throw new Error('Blocked: set DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED to ' + EXPANDED_WRITE_APPROVAL_VALUE + '.');
    if (context.visualAssetLibraryWriteApproval !== VISUAL_ASSET_LIBRARY_WRITE_APPROVAL_VALUE) throw new Error('Blocked: set DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED to ' + VISUAL_ASSET_LIBRARY_WRITE_APPROVAL_VALUE + '.');
    if (!context.spreadsheetId || !context.sheetName || !context.databaseUrl || !context.notionToken) throw new Error('Blocked: missing required source sheet, Notion target, or token configuration.');
    if (!Number.isFinite(context.batchSize) || context.batchSize < 1 || context.batchSize > MAX_BATCH_SIZE) throw new Error('Blocked: DM_NOTION_SYNC_BATCH_SIZE must be between 1 and ' + MAX_BATCH_SIZE + '.');
    if (context.cursorRow < context.startRow || context.cursorRow > context.endRow) throw new Error('Blocked: cursor row must be within configured range.');
    if (context.endRow > context.maxEndRow) throw new Error('Blocked: expanded staging end row exceeds DM_NOTION_SYNC_MAX_END_ROW.');
  }

  function readBatch_(context) {
    const batchStartRow = context.cursorRow;
    const batchEndRow = Math.min(context.endRow, batchStartRow + context.batchSize - 1);
    const readResult = SheetReadService.readSpreadsheetRowsById(context.spreadsheetId, context.sheetName, batchStartRow, batchEndRow);
    if (readResult.warnings.length) throw new Error('Blocked: ' + readResult.warnings.join(' '));
    return { startRow: batchStartRow, endRow: batchEndRow, nextCursorRow: batchEndRow < context.endRow ? batchEndRow + 1 : null, records: readResult.records };
  }

  function fetchSchema_(context) {
    const databaseId = getDatabaseId_(context);
    const database = notionRequest_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
    return database.properties || {};
  }

  function toLegacySyncItem_(item) {
    return {
      source_row: item.source_row,
      file_id: item.file_id || '',
      action: 'verified_sync',
      page_id: '',
      page_url: item.notion_page_url || '',
      sync_percent: item.sync_percent,
      verified_fields: item.complete_fields,
      total_fields: item.total_fields
    };
  }

  function buildFieldVerification_(progress) {
    const rows = [];
    progress.forEach(function(item) {
      (item.field_results || []).forEach(function(field) {
        rows.push({
          source_row: item.source_row,
          file_id: item.file_id || '',
          field_name: field.field,
          expected: field.expected,
          actual: field.actual,
          ok: field.ok,
          reason: field.reason || ''
        });
      });
    });
    return rows;
  }

  function buildFieldSkips_(progress) {
    const skips = [];
    progress.forEach(function(item) {
      (item.validation_notes || []).forEach(function(note) {
        skips.push({ source_row: item.source_row, file_id: item.file_id || '', field_name: '', skipped: true, reason: note });
      });
    });
    return skips;
  }

  function getDatabaseId_(context) {
    if (context.databaseId) return normalizeNotionId_(context.databaseId);
    const match = String(context.databaseUrl || '').match(/[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    if (!match) throw new Error('Blocked: could not parse Notion database ID from URL.');
    return normalizeNotionId_(match[0]);
  }

  function normalizeNotionId_(value) { return String(value || '').replace(/-/g, ''); }

  function notionRequest_(context, method, path, body) {
    const options = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + context.notionToken, 'Notion-Version': NOTION_VERSION } };
    if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
    const response = UrlFetchApp.fetch(NOTION_API_BASE_URL + path, options);
    const status = response.getResponseCode();
    const text = response.getContentText();
    if (status < 200 || status >= 300) throw new Error('Notion API error ' + status + ': ' + text);
    return text ? JSON.parse(text) : {};
  }

  return { syncEligibleBatch: syncEligibleBatch };
})();

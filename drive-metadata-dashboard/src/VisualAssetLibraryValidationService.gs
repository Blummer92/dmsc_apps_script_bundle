var VisualAssetLibraryValidationService = (function() {
  const VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
  const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2022-06-28';
  const EXPANDED_SCOPE = 'ELIGIBLE_STAGING_BATCH';
  const DEFAULT_BATCH_SIZE = 25;
  const MAX_BATCH_SIZE = 50;
  const DEFAULT_EXPANDED_MAX_END_ROW = 454;

  function dryRunFieldValidationOnly() {
    const context = getContext_();
    validateContext_(context);
    const batch = readBatch_(context);
    const schema = fetchSchema_(context);
    const rows = batch.records.map(function(record) { return record.rowNumber; });
    const managerResult = VisualAssetLibraryProductionSyncService.dryRun(rows);
    const validation = buildFieldValidation_(managerResult.row_progress || []);
    const skippedRows = buildSkippedRows_(batch.records, managerResult.row_progress || []);
    const summary = {
      mode: context.mode,
      sync_scope: context.syncScope,
      target_data_source_id: context.dataSourceId,
      batch_start_row: batch.startRow,
      batch_end_row: batch.endRow,
      next_cursor_row: batch.nextCursorRow,
      read_count: batch.records.length,
      skipped_row_count: skippedRows.length,
      skipped_rows: skippedRows,
      field_validation_count: validation.length,
      writable_field_count: validation.filter(function(row) { return !row.skipped; }).length,
      skipped_field_count: validation.filter(function(row) { return row.skipped; }).length,
      sync_summary: managerResult.summary,
      keyword_mode: managerResult.keyword_mode
    };
    const result = {
      summary: summary,
      field_validation: validation,
      row_progress: managerResult.row_progress || [],
      dry_run_proof: VisualAssetLibraryDryRunProofService.save({ summary: summary, field_validation: validation, row_progress: managerResult.row_progress || [] }, schema, context, batch)
    };

    Logger.log('VISUAL ASSET LIBRARY FIELD VALIDATION ONLY - No Notion write executed.');
    Logger.log(JSON.stringify(summary, null, 2));
    logJsonInChunks_(validation, 6000);
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
    if (context.mode !== 'DRY_RUN') throw new Error('Blocked: field validation only runs when DM_NOTION_SYNC_MODE is DRY_RUN.');
    if (context.syncScope !== EXPANDED_SCOPE) throw new Error('Blocked: field validation requires DM_NOTION_SYNC_SCOPE=' + EXPANDED_SCOPE + '.');
    if (context.dataSourceId !== VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID) throw new Error('Blocked: field validation only runs against the approved Visual Asset Library data source.');
    if (!context.spreadsheetId || !context.sheetName || !context.databaseUrl || !context.notionToken) throw new Error('Blocked: missing required source sheet, Notion target, or token configuration.');
    if (!Number.isFinite(context.batchSize) || context.batchSize < 1 || context.batchSize > MAX_BATCH_SIZE) throw new Error('Blocked: DM_NOTION_SYNC_BATCH_SIZE must be between 1 and ' + MAX_BATCH_SIZE + '.');
    if (context.cursorRow < context.startRow || context.cursorRow > context.endRow) throw new Error('Blocked: cursor row must be within the configured range.');
    if (context.endRow > context.maxEndRow) throw new Error('Blocked: expanded staging end row exceeds DM_NOTION_SYNC_MAX_END_ROW.');
  }

  function readBatch_(context) {
    const batchStartRow = context.cursorRow;
    const batchEndRow = Math.min(context.endRow, batchStartRow + context.batchSize - 1);
    const readResult = SheetReadService.readSpreadsheetRowsById(context.spreadsheetId, context.sheetName, batchStartRow, batchEndRow);
    if (readResult.warnings.length) throw new Error('Blocked: ' + readResult.warnings.join(' '));
    return {
      startRow: batchStartRow,
      endRow: batchEndRow,
      nextCursorRow: batchEndRow < context.endRow ? batchEndRow + 1 : null,
      records: readResult.records
    };
  }

  function buildFieldValidation_(progress) {
    const rows = [];
    progress.forEach(function(item) {
      (item.field_results || []).forEach(function(field) {
        rows.push({
          source_row: item.source_row,
          notion_page_id: '',
          notion_page_url: item.notion_page_url || '',
          file_id: item.file_id || '',
          field_name: field.field,
          old_value: field.actual || '',
          proposed_value: field.expected || '',
          source_column_used: field.canonical || '',
          skipped: isBlockingField_(item, field),
          reason: isBlockingField_(item, field) ? field.reason || item.detail || 'Field requires review before sync.' : ''
        });
      });
      if (item.status === 'failed' && !(item.field_results || []).length) {
        rows.push({
          source_row: item.source_row,
          notion_page_id: '',
          notion_page_url: item.notion_page_url || '',
          file_id: item.file_id || '',
          field_name: 'Row validation',
          old_value: '',
          proposed_value: '',
          source_column_used: '',
          skipped: true,
          reason: item.detail || 'Row failed validation.'
        });
      }
    });
    return rows;
  }

  function isBlockingField_(item, field) {
    if (field.ok) return false;
    if (item.status === 'waiting') return false;
    const reason = String(field.reason || item.detail || '').toLowerCase();
    return item.status === 'failed' || reason.indexOf('missing notion property alias') !== -1 || reason.indexOf('no approved notion asset type mapping') !== -1 || reason.indexOf('keyword') !== -1 || reason.indexOf('source value is blank') !== -1;
  }

  function buildSkippedRows_(records, progress) {
    const byRow = {};
    progress.forEach(function(item) { byRow[item.source_row] = item; });
    return records.filter(function(record) { return !byRow[record.rowNumber]; }).map(function(record) {
      return { source_row: record.rowNumber, file_id: record.file_id || '', reason: 'row was not returned by sync manager dry run' };
    });
  }

  function fetchSchema_(context) {
    const databaseId = getDatabaseId_(context);
    const database = notionRequest_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
    return database.properties || {};
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

  function logJsonInChunks_(value, chunkSize) {
    const json = JSON.stringify(value, null, 2);
    for (let start = 0; start < json.length; start += chunkSize) {
      const chunkNumber = Math.floor(start / chunkSize) + 1;
      Logger.log('FIELD VALIDATION CHUNK ' + chunkNumber + '\n' + json.slice(start, start + chunkSize));
    }
  }

  return { dryRunFieldValidationOnly: dryRunFieldValidationOnly };
})();

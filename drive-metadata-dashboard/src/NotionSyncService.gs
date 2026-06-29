var NotionSyncService = (function() {
  const STAGING_DATA_SOURCE_ID = 'collection://bf703afb-7526-4b55-aefa-1c4976032509';
  const VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
  const APPROVED_DATA_SOURCE_IDS = [STAGING_DATA_SOURCE_ID, VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID];
  const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2022-06-28';
  const TEN_ROW_SCOPE = 'TEN_ROW_APPROVAL';
  const EXPANDED_SCOPE = 'ELIGIBLE_STAGING_BATCH';
  const TEN_ROW_WRITE_APPROVAL_VALUE = 'YES_10_ROWS_ONLY';
  const EXPANDED_WRITE_APPROVAL_VALUE = 'YES_EXPANDED_STAGING_BATCH_ONLY';
  const VISUAL_ASSET_LIBRARY_WRITE_APPROVAL_VALUE = 'YES_VISUAL_ASSET_LIBRARY_ONLY';
  const DEFAULT_BATCH_SIZE = 25;
  const MAX_BATCH_SIZE = 50;
  const DEFAULT_EXPANDED_MAX_END_ROW = 454;
  const NOTION_REQUEST_DELAY_MS = 350;
  const OPTIONAL_SYNC_SOURCE_FIELDS = [
    'approved_prompt',
    'proposed_cleaned_prompt',
    'original_image_prompt',
    'openai_guessed_prompt',
    'gemini_guessed_prompt',
    'copilot_prompt_guess',
    'asset_label',
    'asset_category',
    'unit_visual_system',
    'fast_sort_tags',
    'visual_consistency_notes',
    'review_tier',
    'source_approval_status',
    'source_restrictions',
    'do_not_include',
    'blocked_reason',
    'duplicate_resolution_status',
    'agent_notes'
  ];

  function buildRows2To11Payloads() {
    const context = getSyncContext_();
    validateTenRowReadScope_(context);
    const payloads = buildPayloadsForRange_(context, context.startRow, context.endRow, {
      requireEligibleRows: false,
      testScope: 'DM Source Library Pilot rows 2-11',
      pilotReviewScope: '10-row limited Notion payload validation only',
      expectedCount: 10
    }).payloads;

    validatePayloads_(payloads, 10);
    return payloads;
  }

  function dryRunRows2To11() {
    const context = getSyncContext_();
    if (context.mode !== 'DRY_RUN') {
      throw new Error('Blocked: dry run only runs when DM_NOTION_SYNC_MODE is DRY_RUN.');
    }

    const payloads = buildRows2To11Payloads();
    Logger.log('DRY RUN ONLY - No Notion write executed.');
    Logger.log('Rows selected: ' + context.startRow + '-' + context.endRow);
    Logger.log('Payload count: ' + payloads.length);
    Logger.log('Target data source: ' + context.dataSourceId);
    Logger.log(JSON.stringify(payloads, null, 2));
    return payloads;
  }

  function syncRows2To11ToStaging() {
    const context = getSyncContext_();
    validateTenRowWriteScope_(context);

    const payloads = buildRows2To11Payloads();
    const result = syncPayloadsToStaging_(context, payloads, 10);
    Logger.log('STAGING WRITE COMPLETE - Not production sync.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  function dryRunEligibleStagingBatch() {
    const context = getSyncContext_();
    if (context.mode !== 'DRY_RUN') {
      throw new Error('Blocked: expanded dry run only runs when DM_NOTION_SYNC_MODE is DRY_RUN.');
    }
    validateExpandedReadScope_(context);

    const batch = buildExpandedBatch_(context);
    const result = buildBatchSummary_(context, batch, []);
    Logger.log('EXPANDED STAGING DRY RUN ONLY - No Notion write executed.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  function syncEligibleStagingBatchToStaging() {
    const context = getSyncContext_();
    validateExpandedWriteScope_(context);

    const batch = buildExpandedBatch_(context);
    if (!batch.payloads.length) {
      const emptyResult = buildBatchSummary_(context, batch, []);
      Logger.log('EXPANDED STAGING BATCH COMPLETE - No eligible payloads in this batch.');
      Logger.log(JSON.stringify(emptyResult, null, 2));
      return emptyResult;
    }

    const syncResult = syncPayloadsToStaging_(context, batch.payloads, null);
    const result = buildBatchSummary_(context, batch, syncResult.synced, syncResult.verified);
    Logger.log('EXPANDED STAGING BATCH WRITE COMPLETE - Not production sync.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  function buildExpandedBatch_(context) {
    const batchStartRow = context.cursorRow;
    const batchEndRow = Math.min(context.endRow, batchStartRow + context.batchSize - 1);
    const testScope = 'DM Source Library eligible staging batch rows ' + batchStartRow + '-' + batchEndRow;
    const batch = buildPayloadsForRange_(context, batchStartRow, batchEndRow, {
      requireEligibleRows: true,
      testScope: testScope,
      pilotReviewScope: 'Expanded guarded Notion staging batch validation only',
      expectedCount: null
    });
    batch.batch_start_row = batchStartRow;
    batch.batch_end_row = batchEndRow;
    batch.next_cursor_row = batchEndRow < context.endRow ? batchEndRow + 1 : null;
    batch.batch_size = context.batchSize;
    batch.max_end_row = context.maxEndRow;
    return batch;
  }

  function buildPayloadsForRange_(context, startRow, endRow, options) {
    const readResult = SheetReadService.readSpreadsheetRowsById(
      context.spreadsheetId,
      context.sheetName,
      startRow,
      endRow
    );
    if (readResult.warnings.length) {
      throw new Error('Blocked: ' + readResult.warnings.join(' '));
    }

    const skipped = [];
    const payloads = [];
    readResult.records.forEach(function(record) {
      const eligibility = options.requireEligibleRows ? getExpandedEligibility_(record) : { eligible: true, reason: '' };
      if (!eligibility.eligible) {
        skipped.push({ source_row: record.rowNumber, reason: eligibility.reason, file_id: record.file_id || '' });
        return;
      }
      payloads.push(buildPayloadFromRecord_(record, context, options));
    });

    validatePayloads_(payloads, options.expectedCount);
    return {
      payloads: payloads,
      skipped: skipped,
      read_count: readResult.records.length
    };
  }

  function syncPayloadsToStaging_(context, payloads, expectedCount) {
    const databaseId = getDatabaseId_(context);
    const database = notionRequest_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
    const schema = database.properties || {};
    const synced = payloads.map(function(payload) {
      const existingPage = findExistingPageByFileId_(context, databaseId, schema, payload.properties.file_id);
      const properties = buildNotionProperties_(schema, payload.properties, context);
      const response = existingPage
        ? notionRequest_(context, 'patch', '/pages/' + encodeURIComponent(existingPage.id), { properties: properties })
        : notionRequest_(context, 'post', '/pages', { parent: { database_id: databaseId }, properties: properties });

      return {
        source_row: payload.source_row,
        file_id: payload.properties.file_id,
        action: existingPage ? 'updated' : 'created',
        page_id: response.id
      };
    });

    const verified = verifySyncedPayloads_(context, databaseId, schema, payloads);
    const result = {
      mode: context.mode,
      sync_scope: context.syncScope,
      target_database_id: databaseId,
      target_data_source_id: context.dataSourceId,
      synced_count: synced.length,
      verified_count: verified.length,
      synced: synced,
      verified: verified
    };

    if (expectedCount && (result.synced_count !== expectedCount || result.verified_count !== expectedCount)) {
      throw new Error('Blocked: expected ' + expectedCount + ' synced and verified pages. Result: ' + JSON.stringify(result));
    }
    if (result.synced_count !== result.verified_count) {
      throw new Error('Blocked: synced and verified counts do not match. Result: ' + JSON.stringify(result));
    }

    return result;
  }

  function buildBatchSummary_(context, batch, synced, verified) {
    return {
      mode: context.mode,
      sync_scope: context.syncScope,
      target_data_source_id: context.dataSourceId,
      batch_start_row: batch.batch_start_row,
      batch_end_row: batch.batch_end_row,
      next_cursor_row: batch.next_cursor_row,
      read_count: batch.read_count,
      eligible_payload_count: batch.payloads.length,
      skipped_count: batch.skipped.length,
      skipped: batch.skipped,
      synced_count: (synced || []).length,
      verified_count: (verified || []).length,
      synced: synced || [],
      verified: verified || [],
      payloads: context.mode === 'DRY_RUN' ? batch.payloads : []
    };
  }

  function getSyncContext_() {
    const props = PropertiesService.getScriptProperties();
    const startRow = Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2);
    const endRow = Number(props.getProperty('DM_NOTION_SYNC_END_ROW') || 11);
    const batchSize = Number(props.getProperty('DM_NOTION_SYNC_BATCH_SIZE') || DEFAULT_BATCH_SIZE);
    return {
      spreadsheetId: props.getProperty('DM_SOURCE_LIBRARY_SPREADSHEET_ID'),
      sheetName: props.getProperty('DM_SOURCE_LIBRARY_SHEET_NAME'),
      dataSourceId: props.getProperty('DM_NOTION_STAGING_DATA_SOURCE_ID'),
      databaseUrl: props.getProperty('DM_NOTION_STAGING_DATABASE_URL'),
      databaseId: props.getProperty('DM_NOTION_STAGING_DATABASE_ID'),
      notionToken: props.getProperty('DM_NOTION_API_TOKEN') || props.getProperty('NOTION_API_TOKEN'),
      titleProperty: props.getProperty('DM_NOTION_TITLE_PROPERTY') || 'file_name',
      fileIdProperty: props.getProperty('DM_NOTION_FILE_ID_PROPERTY') || 'file_id',
      driveUrlProperty: props.getProperty('DM_NOTION_DRIVE_URL_PROPERTY') || 'drive_url',
      fieldMappings: parseFieldMappings_(props.getProperty('DM_NOTION_FIELD_MAPPINGS')),
      writeApproval: props.getProperty('DM_NOTION_STAGING_WRITE_APPROVED'),
      expandedWriteApproval: props.getProperty('DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED'),
      visualAssetLibraryWriteApproval: props.getProperty('DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED'),
      startRow: startRow,
      endRow: endRow,
      cursorRow: Number(props.getProperty('DM_NOTION_SYNC_CURSOR_ROW') || startRow),
      maxEndRow: Number(props.getProperty('DM_NOTION_SYNC_MAX_END_ROW') || DEFAULT_EXPANDED_MAX_END_ROW),
      batchSize: batchSize,
      syncScope: props.getProperty('DM_NOTION_SYNC_SCOPE') || TEN_ROW_SCOPE,
      mode: props.getProperty('DM_NOTION_SYNC_MODE') || 'DRY_RUN'
    };
  }

  function validateBaseContext_(context) {
    if (APPROVED_DATA_SOURCE_IDS.indexOf(context.dataSourceId) === -1) {
      throw new Error('Blocked: wrong Notion data source target: ' + context.dataSourceId);
    }
    if (!context.spreadsheetId || !context.sheetName || !context.databaseUrl) {
      throw new Error('Blocked: missing required staging sync script properties.');
    }
  }

  function validateTenRowReadScope_(context) {
    validateBaseContext_(context);
    if (context.syncScope !== TEN_ROW_SCOPE) {
      throw new Error('Blocked: 10-row sync requires DM_NOTION_SYNC_SCOPE=' + TEN_ROW_SCOPE + '.');
    }
    if (context.startRow !== 2 || context.endRow !== 11) {
      throw new Error('Blocked: row scope must be exactly rows 2-11. Got ' + context.startRow + '-' + context.endRow + '.');
    }
  }

  function validateTenRowWriteScope_(context) {
    validateTenRowReadScope_(context);
    if (context.mode !== 'STAGING_WRITE') {
      throw new Error('Blocked: staging sync only runs when DM_NOTION_SYNC_MODE is STAGING_WRITE.');
    }
    if (context.writeApproval !== TEN_ROW_WRITE_APPROVAL_VALUE) {
      throw new Error('Blocked: set DM_NOTION_STAGING_WRITE_APPROVED to ' + TEN_ROW_WRITE_APPROVAL_VALUE + ' before staging write.');
    }
    validateTargetWriteApproval_(context);
    if (!context.notionToken) {
      throw new Error('Blocked: missing DM_NOTION_API_TOKEN script property.');
    }
  }

  function validateExpandedReadScope_(context) {
    validateBaseContext_(context);
    if (context.syncScope !== EXPANDED_SCOPE) {
      throw new Error('Blocked: expanded staging batch requires DM_NOTION_SYNC_SCOPE=' + EXPANDED_SCOPE + '.');
    }
    if (context.startRow < 2 || context.endRow < context.startRow) {
      throw new Error('Blocked: expanded staging row range must start at row 2 or later and end after the start row.');
    }
    if (context.endRow > context.maxEndRow) {
      throw new Error('Blocked: expanded staging end row ' + context.endRow + ' exceeds DM_NOTION_SYNC_MAX_END_ROW ' + context.maxEndRow + '.');
    }
    if (context.cursorRow < context.startRow || context.cursorRow > context.endRow) {
      throw new Error('Blocked: cursor row must be within the configured expanded range. Got ' + context.cursorRow + '.');
    }
    if (!Number.isFinite(context.batchSize) || context.batchSize < 1 || context.batchSize > MAX_BATCH_SIZE) {
      throw new Error('Blocked: DM_NOTION_SYNC_BATCH_SIZE must be between 1 and ' + MAX_BATCH_SIZE + '.');
    }
  }

  function validateExpandedWriteScope_(context) {
    validateExpandedReadScope_(context);
    if (context.mode !== 'STAGING_WRITE') {
      throw new Error('Blocked: expanded staging sync only runs when DM_NOTION_SYNC_MODE is STAGING_WRITE.');
    }
    if (context.expandedWriteApproval !== EXPANDED_WRITE_APPROVAL_VALUE) {
      throw new Error('Blocked: set DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED to ' + EXPANDED_WRITE_APPROVAL_VALUE + ' before expanded staging write.');
    }
    validateTargetWriteApproval_(context);
    if (!context.notionToken) {
      throw new Error('Blocked: missing DM_NOTION_API_TOKEN script property.');
    }
  }

  function validateTargetWriteApproval_(context) {
    if (context.dataSourceId !== VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID) {
      return;
    }
    if (context.visualAssetLibraryWriteApproval !== VISUAL_ASSET_LIBRARY_WRITE_APPROVAL_VALUE) {
      throw new Error('Blocked: set DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED to ' + VISUAL_ASSET_LIBRARY_WRITE_APPROVAL_VALUE + ' before Visual Asset Library write.');
    }
  }

  function buildPayloadFromRecord_(record, context, options) {
    const sourceRow = record.rowNumber;
    const fileId = record.file_id;
    const driveUrl = record.drive_url;
    const fileName = record.file_name;
    const pilotReviewStatus = record.pilot_review_status;

    if (!fileId || !driveUrl || !fileName) {
      throw new Error('Blocked: missing file_id, drive_url, or file_name on source row ' + sourceRow);
    }

    const properties = {
      file_name: String(fileName),
      file_id: String(fileId),
      drive_url: String(driveUrl),
      prompt_status: 'Present',
      pilot_review_status: String(pilotReviewStatus || 'Approved for read-only Notion review'),
      pilot_review_scope: options.pilotReviewScope,
      pilot_review_approved_by: 'zachaey blumsrien',
      pilot_review_approval_date: '2026-06-28',
      pilot_review_notes: 'Limited staging/test metadata mapping only. Not production-ready.',
      notion_payload_validation_status: 'Validated',
      source_library_linkage_status: 'Exact File ID',
      production_source_approval_status: 'Not approved',
      generation_clearance: 'Not approved',
      test_scope: options.testScope,
      staging_sync_scope: context.syncScope,
      source_row: sourceRow
    };
    addOptionalSourceProperties_(properties, record);

    return {
      source_row: sourceRow,
      target_data_source_id: context.dataSourceId,
      target_database_url: context.databaseUrl,
      properties: properties
    };
  }

  function addOptionalSourceProperties_(properties, record) {
    OPTIONAL_SYNC_SOURCE_FIELDS.forEach(function(field) {
      if (record[field] && String(record[field]).trim()) {
        properties[field] = String(record[field]);
      }
    });
  }

  function getExpandedEligibility_(record) {
    if (!record.file_id || !record.drive_url || !record.file_name) {
      return { eligible: false, reason: 'missing file_id, drive_url, or file_name' };
    }
    if (isTruthy_(record.do_not_include)) {
      return { eligible: false, reason: 'do_not_include is true' };
    }
    if (String(record.blocked_reason || '').trim()) {
      return { eligible: false, reason: 'blocked_reason is present' };
    }
    if (normalize_(record.review_tier) === 'tier_4' || normalize_(record.review_tier) === '4') {
      return { eligible: false, reason: 'Tier 4 is blocked' };
    }
    if (record.notion_staging_eligible && !isTruthy_(record.notion_staging_eligible)) {
      return { eligible: false, reason: 'notion_staging_eligible is not true' };
    }
    if (normalize_(record.notion_staging_sync_status) === 'blocked') {
      return { eligible: false, reason: 'notion_staging_sync_status is blocked' };
    }
    return { eligible: true, reason: '' };
  }

  function validatePayloads_(payloads, expectedCount) {
    if (expectedCount && payloads.length !== expectedCount) {
      throw new Error('Blocked: expected exactly ' + expectedCount + ' payloads, got ' + payloads.length);
    }

    const fileIds = payloads.map(function(payload) { return payload.properties.file_id; });
    const uniqueFileIds = Array.from(new Set(fileIds));
    if (uniqueFileIds.length !== fileIds.length) {
      throw new Error('Blocked: duplicate file_id values found in sync payload.');
    }
  }

  function getDatabaseId_(context) {
    if (context.databaseId) {
      return normalizeNotionId_(context.databaseId);
    }

    const match = String(context.databaseUrl || '').match(/[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    if (!match) {
      throw new Error('Blocked: could not parse Notion database ID from DM_NOTION_STAGING_DATABASE_URL.');
    }
    return normalizeNotionId_(match[0]);
  }

  function normalizeNotionId_(value) {
    return String(value || '').replace(/-/g, '');
  }

  function findExistingPageByFileId_(context, databaseId, schema, fileId) {
    const fileIdProperty = schema[context.fileIdProperty];
    if (!fileIdProperty) {
      throw new Error('Blocked: Notion database is missing file ID property: ' + context.fileIdProperty);
    }

    const filter = buildEqualsFilter_(context.fileIdProperty, fileIdProperty.type, fileId);
    const result = notionRequest_(context, 'post', '/databases/' + encodeURIComponent(databaseId) + '/query', { filter: filter, page_size: 2 });
    const pages = result.results || [];
    if (pages.length > 1) {
      throw new Error('Blocked: duplicate Notion pages found for file_id ' + fileId);
    }
    return pages[0] || null;
  }

  function verifySyncedPayloads_(context, databaseId, schema, payloads) {
    return payloads.map(function(payload) {
      const page = findExistingPageByFileId_(context, databaseId, schema, payload.properties.file_id);
      if (!page) {
        throw new Error('Blocked: verification failed for file_id ' + payload.properties.file_id);
      }
      return {
        source_row: payload.source_row,
        file_id: payload.properties.file_id,
        page_id: page.id
      };
    });
  }

  function buildEqualsFilter_(propertyName, propertyType, value) {
    if (propertyType === 'title') return { property: propertyName, title: { equals: String(value) } };
    if (propertyType === 'number') return { property: propertyName, number: { equals: Number(value) } };
    if (propertyType === 'url') return { property: propertyName, url: { equals: String(value) } };
    if (propertyType === 'select') return { property: propertyName, select: { equals: String(value) } };
    if (propertyType === 'status') return { property: propertyName, status: { equals: String(value) } };
    return { property: propertyName, rich_text: { equals: String(value) } };
  }

  function parseFieldMappings_(rawValue) {
    if (!rawValue || !String(rawValue).trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('mapping must be a JSON object');
      }
      return parsed;
    } catch (error) {
      throw new Error('Blocked: DM_NOTION_FIELD_MAPPINGS must be valid JSON object mapping source fields to Notion properties. ' + error.message);
    }
  }

  function getNotionSchemaName_(sourceName, context) {
    if (sourceName === 'file_name') return context.titleProperty;
    if (sourceName === 'file_id') return context.fileIdProperty;
    if (sourceName === 'drive_url') return context.driveUrlProperty;
    if (context.fieldMappings && context.fieldMappings[sourceName]) {
      return String(context.fieldMappings[sourceName]);
    }
    return sourceName;
  }

  function buildNotionProperties_(schema, sourceProperties, context) {
    const properties = {};
    Object.keys(sourceProperties).forEach(function(name) {
      const schemaName = getNotionSchemaName_(name, context);
      const propertySchema = schema[schemaName];
      if (!propertySchema) return;
      properties[schemaName] = formatNotionProperty_(propertySchema.type, sourceProperties[name]);
    });
    if (!properties[context.titleProperty]) {
      throw new Error('Blocked: Notion database is missing title property: ' + context.titleProperty);
    }
    if (!properties[context.fileIdProperty]) {
      throw new Error('Blocked: Notion database is missing file ID property: ' + context.fileIdProperty);
    }
    return properties;
  }

  function formatNotionProperty_(propertyType, value) {
    const stringValue = String(value || '');
    if (propertyType === 'title') return { title: [{ text: { content: stringValue } }] };
    if (propertyType === 'rich_text') return { rich_text: [{ text: { content: stringValue } }] };
    if (propertyType === 'url') return { url: stringValue || null };
    if (propertyType === 'number') return { number: Number(value) };
    if (propertyType === 'date') return { date: stringValue ? { start: stringValue } : null };
    if (propertyType === 'select') return { select: stringValue ? { name: stringValue } : null };
    if (propertyType === 'status') return { status: stringValue ? { name: stringValue } : null };
    if (propertyType === 'checkbox') return { checkbox: Boolean(value) };
    return { rich_text: [{ text: { content: stringValue } }] };
  }

  function notionRequest_(context, method, path, body) {
    const options = {
      method: method,
      muteHttpExceptions: true,
      headers: {
        Authorization: 'Bearer ' + context.notionToken,
        'Notion-Version': NOTION_VERSION
      }
    };
    if (body) {
      options.contentType = 'application/json';
      options.payload = JSON.stringify(body);
    }

    const response = UrlFetchApp.fetch(NOTION_API_BASE_URL + path, options);
    throttleNotionRequest_();
    const status = response.getResponseCode();
    const text = response.getContentText();
    const parsed = text ? JSON.parse(text) : {};
    if (status < 200 || status >= 300) {
      throw new Error('Notion API error ' + status + ': ' + text);
    }
    return parsed;
  }

  function throttleNotionRequest_() {
    if (typeof Utilities !== 'undefined' && Utilities.sleep) {
      Utilities.sleep(NOTION_REQUEST_DELAY_MS);
    }
  }

  function isTruthy_(value) {
    return ['true', 'yes', 'y', '1', 'eligible', 'approved'].indexOf(normalize_(value)) !== -1;
  }

  function normalize_(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  return {
    buildRows2To11Payloads: buildRows2To11Payloads,
    dryRunRows2To11: dryRunRows2To11,
    syncRows2To11ToStaging: syncRows2To11ToStaging,
    dryRunEligibleStagingBatch: dryRunEligibleStagingBatch,
    syncEligibleStagingBatchToStaging: syncEligibleStagingBatchToStaging
  };
})();

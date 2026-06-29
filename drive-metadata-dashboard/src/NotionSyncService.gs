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
  const GUESSED_PROMPT_APPROVAL_VALUE = 'YES_GUESSED_PROMPTS_APPROVED';
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
    'approved_use',
    'source_approved_use',
    'use_boundary',
    'source_use_boundary',
    'reuse_status',
    'source_reuse_status',
    'source_review_outcome',
    'unit_lesson_material_type',
    'unit_lesson_material',
    'material_type',
    'unit_name',
    'lesson_name',
    'version',
    'asset_version',
    'source_version',
    'cognitive_load_rating',
    'source_cognitive_load_rating',
    'reviewed_cognitive_load_rating',
    'review_tier',
    'source_approval_status',
    'source_restrictions',
    'do_not_include',
    'blocked_reason',
    'duplicate_resolution_status',
    'agent_notes'
  ];
  const VISUAL_ASSET_LIBRARY_FIELDS = [
    'Asset title',
    'file_id',
    'Source file link in Google Drive',
    'Alt text',
    'Accessibility notes',
    'Approved use',
    'Asset type',
    'Instructional purpose',
    'Keywords',
    'Reuse status',
    'Style family',
    'Thumbnail',
    'Unit / lesson / material type',
    'Version',
    'Cognitive load rating'
  ];
  const CONTROLLED_OPTIONS = {
    'Asset type': ['icon', 'diagram', 'worksheet image', 'slide image', 'process visual', 'poster visual'],
    'Approved use': ['worksheet', 'slide', 'poster', 'student-facing', 'teacher-facing'],
    'Reuse status': ['approved', 'draft', 'needs revision', 'retired'],
    'Cognitive load rating': ['low', 'medium', 'high']
  };
  const CONTROLLED_ALIASES = {
    'Asset type': {
      icon: 'icon',
      icons: 'icon',
      icon_set: 'icon',
      diagram: 'diagram',
      worksheet: 'worksheet image',
      worksheet_image: 'worksheet image',
      slide: 'slide image',
      slide_image: 'slide image',
      process: 'process visual',
      process_visual: 'process visual',
      poster: 'poster visual',
      poster_visual: 'poster visual'
    },
    'Approved use': {
      worksheet: 'worksheet',
      worksheets: 'worksheet',
      slide: 'slide',
      slides: 'slide',
      poster: 'poster',
      posters: 'poster',
      student: 'student-facing',
      student_facing: 'student-facing',
      teacher: 'teacher-facing',
      teacher_facing: 'teacher-facing'
    },
    'Reuse status': {
      approved: 'approved',
      source_approved: 'approved',
      draft: 'draft',
      needs_revision: 'needs revision',
      revision_needed: 'needs revision',
      retired: 'retired'
    },
    'Cognitive load rating': {
      low: 'low',
      medium: 'medium',
      med: 'medium',
      high: 'high'
    }
  };
  const ACCESSIBILITY_KEYWORDS = [
    'accessibility',
    'accessible',
    'alt text',
    'screen reader',
    'clarity',
    'clear',
    'legible',
    'readable',
    'contrast',
    'cognitive load'
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
    if (isVisualAssetLibraryTarget_(context)) {
      result.field_validation = buildDryRunValidation_(context, batch);
    }
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
    result.field_skips = syncResult.field_skips || [];
    result.mapping_warnings = syncResult.mapping_warnings || [];
    Logger.log('EXPANDED STAGING BATCH WRITE COMPLETE - Not production sync.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  function auditVisualAssetLibrarySync() {
    const context = getSyncContext_();
    validateBaseContext_(context);
    if (!isVisualAssetLibraryTarget_(context)) {
      throw new Error('Blocked: audit export only runs against the approved Visual Asset Library data source.');
    }
    if (!context.notionToken) {
      throw new Error('Blocked: missing DM_NOTION_API_TOKEN script property.');
    }

    const databaseId = getDatabaseId_(context);
    const database = notionRequest_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
    const schema = database.properties || {};
    const pages = queryAllDatabasePages_(context, databaseId);
    const records = pages.map(function(page) {
      return buildAuditRecord_(page, schema, context);
    });
    addDuplicateFlags_(records);

    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    const jsonFile = DriveApp.createFile(
      'visual-asset-library-audit-' + timestamp + '.json',
      JSON.stringify(records, null, 2),
      MimeType.PLAIN_TEXT
    );
    const csvFile = DriveApp.createFile(
      'visual-asset-library-audit-' + timestamp + '.csv',
      buildCsv_(records),
      MimeType.CSV
    );
    const result = {
      mode: 'READ_ONLY_AUDIT_EXPORT',
      target_data_source_id: context.dataSourceId,
      record_count: records.length,
      json_file_url: jsonFile.getUrl(),
      csv_file_url: csvFile.getUrl(),
      duplicate_file_id_count: countDuplicateRecords_(records, 'duplicate_file_id'),
      duplicate_drive_url_count: countDuplicateRecords_(records, 'duplicate_drive_url'),
      duplicate_title_count: countDuplicateRecords_(records, 'duplicate_title')
    };
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
    const fieldSkips = [];
    const mappingWarnings = [];
    const synced = payloads.map(function(payload) {
      const existingPage = findExistingPageByFileId_(context, databaseId, schema, payload.properties.file_id);
      const plan = buildNotionPropertyPlan_(schema, payload.properties, context);
      Array.prototype.push.apply(fieldSkips, plan.skipped.map(function(skip) {
        return Object.assign({ source_row: payload.source_row, file_id: payload.properties.file_id }, skip);
      }));
      Array.prototype.push.apply(mappingWarnings, plan.warnings.map(function(warning) {
        return Object.assign({ source_row: payload.source_row, file_id: payload.properties.file_id }, warning);
      }));
      const response = existingPage
        ? notionRequest_(context, 'patch', '/pages/' + encodeURIComponent(existingPage.id), { properties: plan.properties })
        : notionRequest_(context, 'post', '/pages', { parent: { database_id: databaseId }, properties: plan.properties });

      return {
        source_row: payload.source_row,
        file_id: payload.properties.file_id,
        action: existingPage ? 'updated' : 'created',
        page_id: response.id,
        page_url: response.url || buildNotionPageUrl_(response.id)
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
      verified: verified,
      field_skips: fieldSkips,
      mapping_warnings: mappingWarnings
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
      allowGuessedPrompts: props.getProperty('DM_VISUAL_ASSET_LIBRARY_ALLOW_GUESSED_PROMPTS') === GUESSED_PROMPT_APPROVAL_VALUE,
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
        page_id: page.id,
        page_url: page.url || buildNotionPageUrl_(page.id)
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
    return buildNotionPropertyPlan_(schema, sourceProperties, context).properties;
  }

  function buildNotionPropertyPlan_(schema, sourceProperties, context) {
    const plan = isVisualAssetLibraryTarget_(context)
      ? buildVisualAssetLibraryPropertyPlan_(schema, sourceProperties, context)
      : buildGenericPropertyPlan_(schema, sourceProperties, context);
    if (!plan.properties[context.titleProperty]) {
      throw new Error('Blocked: Notion database is missing title property: ' + context.titleProperty);
    }
    if (!plan.properties[context.fileIdProperty]) {
      throw new Error('Blocked: Notion database is missing file ID property: ' + context.fileIdProperty);
    }
    return plan;
  }

  function buildGenericPropertyPlan_(schema, sourceProperties, context) {
    const properties = {};
    const entries = [];
    Object.keys(sourceProperties).forEach(function(name) {
      const schemaName = getNotionSchemaName_(name, context);
      const propertySchema = schema[schemaName];
      if (!propertySchema) return;
      properties[schemaName] = formatNotionProperty_(propertySchema, sourceProperties[name]);
      entries.push({ field_name: schemaName, source_column_used: name, proposed_value: sourceProperties[name] });
    });
    return { properties: properties, entries: entries, skipped: [], warnings: [] };
  }

  function buildVisualAssetLibraryPropertyPlan_(schema, sourceProperties, context) {
    const properties = {};
    const entries = [];
    const skipped = [];
    const warnings = [];
    addVisualEntry_(schema, properties, entries, skipped, context.titleProperty, sourceProperties.file_name, 'file_name');
    addVisualEntry_(schema, properties, entries, skipped, context.fileIdProperty, sourceProperties.file_id, 'file_id');
    addVisualEntry_(schema, properties, entries, skipped, context.driveUrlProperty, sourceProperties.drive_url || buildDriveUrlFromFileId_(sourceProperties.file_id), 'drive_url');

    const altText = pickPromptValue_(sourceProperties, context, skipped);
    addVisualEntry_(schema, properties, entries, skipped, 'Alt text', altText.value, altText.sourceColumn);

    const accessibilityNotes = pickAccessibilityNotes_(sourceProperties.visual_consistency_notes);
    addVisualEntry_(schema, properties, entries, skipped, 'Accessibility notes', accessibilityNotes.value, accessibilityNotes.sourceColumn, accessibilityNotes.reason);

    const assetType = normalizeControlledValue_('Asset type', pickFirstSourceValue_(sourceProperties, ['asset_category']).value);
    addVisualEntry_(schema, properties, entries, skipped, 'Asset type', assetType.value, 'asset_category', assetType.reason);

    const keywords = parseKeywords_(pickFirstSourceValue_(sourceProperties, ['fast_sort_tags']).value);
    addVisualEntry_(schema, properties, entries, skipped, 'Keywords', keywords.value, 'fast_sort_tags', keywords.reason);

    addVisualEntry_(schema, properties, entries, skipped, 'Style family', pickFirstSourceValue_(sourceProperties, ['unit_visual_system']).value, 'unit_visual_system');

    const approvedUseSource = pickFirstSourceValue_(sourceProperties, ['approved_use', 'source_approved_use', 'use_boundary', 'source_use_boundary']);
    const approvedUse = normalizeControlledValue_('Approved use', approvedUseSource.value);
    addVisualEntry_(schema, properties, entries, skipped, 'Approved use', approvedUse.value, approvedUseSource.sourceColumn, approvedUse.reason);

    const reuseStatusSource = pickFirstSourceValue_(sourceProperties, ['reuse_status', 'source_reuse_status', 'source_review_outcome']);
    const reuseStatus = normalizeControlledValue_('Reuse status', reuseStatusSource.value);
    addVisualEntry_(schema, properties, entries, skipped, 'Reuse status', reuseStatus.value, reuseStatusSource.sourceColumn, reuseStatus.reason);

    addVisualEntry_(schema, properties, entries, skipped, 'Instructional purpose', pickFirstSourceValue_(sourceProperties, ['asset_label']).value, 'asset_label');
    const unitMaterial = pickFirstSourceValue_(sourceProperties, ['unit_lesson_material_type', 'unit_lesson_material', 'material_type', 'unit_name', 'lesson_name']);
    addVisualEntry_(schema, properties, entries, skipped, 'Unit / lesson / material type', unitMaterial.value, unitMaterial.sourceColumn);
    const version = pickFirstSourceValue_(sourceProperties, ['version', 'asset_version', 'source_version']);
    addVisualEntry_(schema, properties, entries, skipped, 'Version', version.value, version.sourceColumn);
    const cognitiveLoadSource = pickFirstSourceValue_(sourceProperties, ['reviewed_cognitive_load_rating', 'cognitive_load_rating', 'source_cognitive_load_rating']);
    const cognitiveLoad = normalizeControlledValue_('Cognitive load rating', cognitiveLoadSource.value);
    addVisualEntry_(schema, properties, entries, skipped, 'Cognitive load rating', cognitiveLoad.value, cognitiveLoadSource.sourceColumn, cognitiveLoad.reason);

    if (!schema.Thumbnail) {
      skipped.push({ field_name: 'Thumbnail', source_column_used: '', proposed_value: '', skipped: true, reason: 'Notion property is missing; thumbnail technical strategy remains unconfirmed' });
    } else {
      skipped.push({ field_name: 'Thumbnail', source_column_used: '', proposed_value: '', skipped: true, reason: 'left empty until thumbnail technical strategy is confirmed' });
    }

    Object.keys(context.fieldMappings || {}).forEach(function(sourceName) {
      warnings.push({ field_name: context.fieldMappings[sourceName], source_column_used: sourceName, reason: 'DM_NOTION_FIELD_MAPPINGS is ignored for Visual Asset Library; approved hardcoded mappings are used instead' });
    });

    return { properties: properties, entries: entries, skipped: skipped, warnings: warnings };
  }

  function addVisualEntry_(schema, properties, entries, skipped, fieldName, value, sourceColumn, skipReason) {
    const propertySchema = schema[fieldName];
    const cleanValue = normalizeValueForWrite_(value);
    if (!propertySchema) {
      skipped.push({ field_name: fieldName, source_column_used: sourceColumn || '', proposed_value: cleanValue, skipped: true, reason: 'Notion property is missing' });
      return;
    }
    if (cleanValue === '' || cleanValue === null || (Array.isArray(cleanValue) && cleanValue.length === 0)) {
      skipped.push({ field_name: fieldName, source_column_used: sourceColumn || '', proposed_value: cleanValue, skipped: true, reason: skipReason || 'no reviewed source value available' });
      return;
    }
    const validation = validateNotionOption_(propertySchema, fieldName, cleanValue);
    if (!validation.ok) {
      skipped.push({ field_name: fieldName, source_column_used: sourceColumn || '', proposed_value: cleanValue, skipped: true, reason: validation.reason });
      return;
    }
    properties[fieldName] = formatNotionProperty_(propertySchema, cleanValue);
    entries.push({ field_name: fieldName, source_column_used: sourceColumn || '', proposed_value: cleanValue, skipped: false, reason: '' });
  }

  function normalizeValueForWrite_(value) {
    if (Array.isArray(value)) return value.filter(function(item) { return String(item || '').trim(); });
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function validateNotionOption_(propertySchema, fieldName, value) {
    if (propertySchema.type !== 'select' && propertySchema.type !== 'status' && propertySchema.type !== 'multi_select') {
      return { ok: true, reason: '' };
    }
    const values = Array.isArray(value) ? value : [value];
    const allowed = CONTROLLED_OPTIONS[fieldName] || getSchemaOptions_(propertySchema);
    const schemaOptions = getSchemaOptions_(propertySchema);
    const invalid = values.filter(function(item) {
      return allowed.indexOf(item) === -1 || (schemaOptions.length && schemaOptions.indexOf(item) === -1);
    });
    if (invalid.length) {
      return { ok: false, reason: 'value is outside approved Notion options: ' + invalid.join(', ') };
    }
    return { ok: true, reason: '' };
  }

  function getSchemaOptions_(propertySchema) {
    const type = propertySchema.type;
    if (!propertySchema[type]) return [];
    if (!propertySchema[type].options) return [];
    return propertySchema[type].options.map(function(option) { return option.name; });
  }

  function pickPromptValue_(sourceProperties, context, skipped) {
    const approved = pickFirstSourceValue_(sourceProperties, ['approved_prompt', 'proposed_cleaned_prompt', 'original_image_prompt']);
    if (approved.value) return approved;
    if (!context.allowGuessedPrompts) {
      skipped.push({ field_name: 'Alt text', source_column_used: 'openai_guessed_prompt/gemini_guessed_prompt/copilot_prompt_guess', proposed_value: '', skipped: true, reason: 'guessed prompt excluded by default; set DM_VISUAL_ASSET_LIBRARY_ALLOW_GUESSED_PROMPTS=' + GUESSED_PROMPT_APPROVAL_VALUE + ' only after approval' });
      return { value: '', sourceColumn: '' };
    }
    const guessed = pickFirstSourceValue_(sourceProperties, ['openai_guessed_prompt', 'gemini_guessed_prompt', 'copilot_prompt_guess']);
    if (!guessed.value) return { value: '', sourceColumn: '' };
    return { value: 'Guessed prompt, requires review: ' + guessed.value, sourceColumn: guessed.sourceColumn };
  }

  function pickAccessibilityNotes_(value) {
    const text = String(value || '').trim();
    if (!text) return { value: '', sourceColumn: 'visual_consistency_notes', reason: 'no reviewed accessibility or clarity note available' };
    const normalized = text.toLowerCase();
    const hasAccessibilitySignal = ACCESSIBILITY_KEYWORDS.some(function(keyword) {
      return normalized.indexOf(keyword) !== -1;
    });
    if (!hasAccessibilitySignal) {
      return { value: '', sourceColumn: 'visual_consistency_notes', reason: 'visual_consistency_notes is not accessibility/clarity-specific' };
    }
    return { value: text, sourceColumn: 'visual_consistency_notes', reason: '' };
  }

  function pickFirstSourceValue_(sourceProperties, sourceNames) {
    for (let i = 0; i < sourceNames.length; i += 1) {
      const name = sourceNames[i];
      const value = String(sourceProperties[name] || '').trim();
      if (value) return { value: value, sourceColumn: name };
    }
    return { value: '', sourceColumn: sourceNames.join(' | ') };
  }

  function normalizeControlledValue_(fieldName, rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return { value: '', reason: 'no reviewed source value available' };
    const aliases = CONTROLLED_ALIASES[fieldName] || {};
    const direct = CONTROLLED_OPTIONS[fieldName] || [];
    if (direct.indexOf(value) !== -1) return { value: value, reason: '' };
    const normalized = normalize_(value);
    if (aliases[normalized]) return { value: aliases[normalized], reason: '' };
    return { value: '', reason: 'source value is outside approved options: ' + value };
  }

  function parseKeywords_(rawValue) {
    const text = String(rawValue || '').trim();
    if (!text) return { value: [], reason: 'no reviewed keyword source value available' };
    const tags = text.split(/[,;\n]+/).map(function(tag) {
      return tag.trim();
    }).filter(Boolean);
    return { value: Array.from(new Set(tags)), reason: '' };
  }

  function buildDriveUrlFromFileId_(fileId) {
    const cleanFileId = String(fileId || '').trim();
    return cleanFileId ? 'https://drive.google.com/file/d/' + cleanFileId + '/view' : '';
  }

  function formatNotionProperty_(propertySchema, value) {
    const propertyType = propertySchema.type || propertySchema;
    const stringValue = String(value || '');
    if (propertyType === 'title') return { title: [{ text: { content: stringValue } }] };
    if (propertyType === 'rich_text') return { rich_text: [{ text: { content: stringValue } }] };
    if (propertyType === 'url') return { url: stringValue || null };
    if (propertyType === 'number') return { number: Number(value) };
    if (propertyType === 'date') return { date: stringValue ? { start: stringValue } : null };
    if (propertyType === 'select') return { select: stringValue ? { name: stringValue } : null };
    if (propertyType === 'status') return { status: stringValue ? { name: stringValue } : null };
    if (propertyType === 'multi_select') {
      const values = Array.isArray(value) ? value : parseKeywords_(stringValue).value;
      return { multi_select: values.map(function(item) { return { name: String(item) }; }) };
    }
    if (propertyType === 'checkbox') return { checkbox: Boolean(value) };
    if (propertyType === 'files') return { files: [] };
    return { rich_text: [{ text: { content: stringValue } }] };
  }

  function buildDryRunValidation_(context, batch) {
    if (!context.notionToken) {
      throw new Error('Blocked: Visual Asset Library dry-run validation requires DM_NOTION_API_TOKEN.');
    }
    const databaseId = getDatabaseId_(context);
    const database = notionRequest_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
    const schema = database.properties || {};
    const rows = [];
    batch.payloads.forEach(function(payload) {
      const existingPage = findExistingPageByFileId_(context, databaseId, schema, payload.properties.file_id);
      const plan = buildNotionPropertyPlan_(schema, payload.properties, context);
      plan.entries.forEach(function(entry) {
        rows.push({
          source_row: payload.source_row,
          notion_page_id: existingPage ? existingPage.id : '',
          notion_page_url: existingPage ? existingPage.url || buildNotionPageUrl_(existingPage.id) : '',
          file_id: payload.properties.file_id,
          field_name: entry.field_name,
          old_value: existingPage ? extractPropertyValue_(existingPage.properties[entry.field_name]) : '',
          proposed_value: entry.proposed_value,
          source_column_used: entry.source_column_used,
          skipped: false,
          reason: ''
        });
      });
      plan.skipped.forEach(function(skip) {
        rows.push({
          source_row: payload.source_row,
          notion_page_id: existingPage ? existingPage.id : '',
          notion_page_url: existingPage ? existingPage.url || buildNotionPageUrl_(existingPage.id) : '',
          file_id: payload.properties.file_id,
          field_name: skip.field_name,
          old_value: existingPage && existingPage.properties[skip.field_name] ? extractPropertyValue_(existingPage.properties[skip.field_name]) : '',
          proposed_value: skip.proposed_value,
          source_column_used: skip.source_column_used,
          skipped: true,
          reason: skip.reason
        });
      });
    });
    return rows;
  }

  function queryAllDatabasePages_(context, databaseId) {
    const pages = [];
    let cursor = null;
    do {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const result = notionRequest_(context, 'post', '/databases/' + encodeURIComponent(databaseId) + '/query', body);
      Array.prototype.push.apply(pages, result.results || []);
      cursor = result.has_more ? result.next_cursor : null;
    } while (cursor);
    return pages;
  }

  function buildAuditRecord_(page, schema, context) {
    const record = {
      notion_page_id: page.id,
      notion_page_url: page.url || buildNotionPageUrl_(page.id),
      created_time: page.created_time || '',
      last_edited_time: page.last_edited_time || '',
      mapping_warnings: [],
      skipped_field_reasons: []
    };
    VISUAL_ASSET_LIBRARY_FIELDS.forEach(function(fieldName) {
      record[fieldName] = page.properties[fieldName] ? extractPropertyValue_(page.properties[fieldName]) : '';
      if (!schema[fieldName]) {
        record.skipped_field_reasons.push(fieldName + ': Notion property is missing');
      }
    });
    record.file_id = record[context.fileIdProperty] || record.file_id || '';
    record.drive_url = record[context.driveUrlProperty] || record.drive_url || '';
    record.asset_title = record[context.titleProperty] || record.asset_title || '';
    if (record.file_id && record.drive_url && record.drive_url.indexOf(record.file_id) === -1) {
      record.mapping_warnings.push('Drive URL does not contain file_id');
    }
    return record;
  }

  function addDuplicateFlags_(records) {
    addDuplicateFlag_(records, 'file_id', 'duplicate_file_id');
    addDuplicateFlag_(records, 'drive_url', 'duplicate_drive_url');
    addDuplicateFlag_(records, 'asset_title', 'duplicate_title');
  }

  function addDuplicateFlag_(records, fieldName, flagName) {
    const counts = {};
    records.forEach(function(record) {
      const value = String(record[fieldName] || '').trim();
      if (!value) return;
      counts[value] = (counts[value] || 0) + 1;
    });
    records.forEach(function(record) {
      const value = String(record[fieldName] || '').trim();
      record[flagName] = Boolean(value && counts[value] > 1);
    });
  }

  function countDuplicateRecords_(records, flagName) {
    return records.filter(function(record) { return record[flagName]; }).length;
  }

  function buildCsv_(records) {
    const headers = [
      'notion_page_id',
      'notion_page_url',
      'created_time',
      'last_edited_time',
      'asset_title',
      'file_id',
      'drive_url'
    ].concat(VISUAL_ASSET_LIBRARY_FIELDS).concat([
      'duplicate_file_id',
      'duplicate_drive_url',
      'duplicate_title',
      'mapping_warnings',
      'skipped_field_reasons'
    ]);
    const uniqueHeaders = Array.from(new Set(headers));
    const rows = records.map(function(record) {
      return uniqueHeaders.map(function(header) {
        const value = Array.isArray(record[header]) ? record[header].join('; ') : record[header];
        return csvEscape_(value);
      }).join(',');
    });
    return uniqueHeaders.join(',') + '\n' + rows.join('\n');
  }

  function csvEscape_(value) {
    const stringValue = String(value === undefined || value === null ? '' : value);
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }

  function extractPropertyValue_(property) {
    if (!property) return '';
    if (property.type === 'title') return richTextToPlainText_(property.title);
    if (property.type === 'rich_text') return richTextToPlainText_(property.rich_text);
    if (property.type === 'url') return property.url || '';
    if (property.type === 'number') return property.number === null || property.number === undefined ? '' : String(property.number);
    if (property.type === 'date') return property.date ? property.date.start || '' : '';
    if (property.type === 'select') return property.select ? property.select.name : '';
    if (property.type === 'status') return property.status ? property.status.name : '';
    if (property.type === 'multi_select') return (property.multi_select || []).map(function(item) { return item.name; }).join(', ');
    if (property.type === 'checkbox') return property.checkbox ? 'true' : 'false';
    if (property.type === 'files') return (property.files || []).map(function(file) { return file.name || file.file && file.file.url || file.external && file.external.url || ''; }).join(', ');
    return '';
  }

  function richTextToPlainText_(items) {
    return (items || []).map(function(item) { return item.plain_text || ''; }).join('');
  }

  function buildNotionPageUrl_(pageId) {
    const cleanId = String(pageId || '').replace(/-/g, '');
    return cleanId ? 'https://www.notion.so/' + cleanId : '';
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

  function isVisualAssetLibraryTarget_(context) {
    return context.dataSourceId === VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID;
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
    syncEligibleStagingBatchToStaging: syncEligibleStagingBatchToStaging,
    auditVisualAssetLibrarySync: auditVisualAssetLibrarySync
  };
})();

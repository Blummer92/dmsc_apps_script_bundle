var VisualAssetLibraryWriteService = (function() {
  const VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
  const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2022-06-28';
  const EXPANDED_SCOPE = 'ELIGIBLE_STAGING_BATCH';
  const EXPANDED_WRITE_APPROVAL_VALUE = 'YES_EXPANDED_STAGING_BATCH_ONLY';
  const VISUAL_ASSET_LIBRARY_WRITE_APPROVAL_VALUE = 'YES_VISUAL_ASSET_LIBRARY_ONLY';
  const GUESSED_PROMPT_APPROVAL_VALUE = 'YES_GUESSED_PROMPTS_APPROVED';
  const DEFAULT_BATCH_SIZE = 25;
  const MAX_BATCH_SIZE = 50;
  const DEFAULT_EXPANDED_MAX_END_ROW = 454;
  const NOTION_REQUEST_DELAY_MS = 350;
  const NOTION_RICH_TEXT_CHUNK_LENGTH = 1900;

  function syncEligibleBatch() {
    const context = getContext_();
    validateContext_(context);
    const batch = readBatch_(context);
    const databaseId = getDatabaseId_(context);
    const database = notionRequest_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
    const schema = database.properties || {};
    const skippedRows = [];
    const fieldSkips = [];
    const synced = [];

    batch.records.forEach(function(record) {
      const eligibility = getEligibility_(record);
      if (!eligibility.eligible) {
        skippedRows.push({ source_row: record.rowNumber, file_id: record.file_id || '', reason: eligibility.reason });
        return;
      }
      const existingPage = findExistingPageByFileId_(context, databaseId, schema, record.file_id);
      const plan = buildProperties_(record, schema, context);
      Array.prototype.push.apply(fieldSkips, plan.skipped.map(function(skip) {
        return Object.assign({ source_row: record.rowNumber, file_id: record.file_id || '' }, skip);
      }));
      const response = existingPage
        ? notionRequest_(context, 'patch', '/pages/' + encodeURIComponent(existingPage.id), { properties: plan.properties })
        : notionRequest_(context, 'post', '/pages', { parent: { database_id: databaseId }, properties: plan.properties });
      synced.push({
        source_row: record.rowNumber,
        file_id: record.file_id,
        action: existingPage ? 'updated' : 'created',
        page_id: response.id,
        page_url: response.url || buildNotionPageUrl_(response.id)
      });
    });

    const verified = synced.map(function(item) {
      const page = findExistingPageByFileId_(context, databaseId, schema, item.file_id);
      if (!page) throw new Error('Blocked: verification failed for file_id ' + item.file_id);
      return { source_row: item.source_row, file_id: item.file_id, page_id: page.id, page_url: page.url || buildNotionPageUrl_(page.id) };
    });

    const result = {
      mode: context.mode,
      sync_scope: context.syncScope,
      target_data_source_id: context.dataSourceId,
      batch_start_row: batch.startRow,
      batch_end_row: batch.endRow,
      next_cursor_row: batch.nextCursorRow,
      read_count: batch.records.length,
      skipped_count: skippedRows.length,
      skipped: skippedRows,
      synced_count: synced.length,
      verified_count: verified.length,
      synced: synced,
      verified: verified,
      field_skips: fieldSkips
    };
    if (result.synced_count !== result.verified_count) throw new Error('Blocked: synced and verified counts do not match. Result: ' + JSON.stringify(result));
    Logger.log('VISUAL ASSET LIBRARY BATCH WRITE COMPLETE - Not production approval.');
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
      titleProperty: props.getProperty('DM_NOTION_TITLE_PROPERTY') || 'Asset title',
      fileIdProperty: props.getProperty('DM_NOTION_FILE_ID_PROPERTY') || 'file_id',
      driveUrlProperty: props.getProperty('DM_NOTION_DRIVE_URL_PROPERTY') || 'Source file link in Google Drive',
      allowGuessedPrompts: props.getProperty('DM_VISUAL_ASSET_LIBRARY_ALLOW_GUESSED_PROMPTS') === GUESSED_PROMPT_APPROVAL_VALUE,
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

  function buildProperties_(record, schema, context) {
    const properties = {};
    const skipped = [];
    const metadata = VisualAssetLibraryPromptMetadataService.build(record, { allowGuessedPrompts: context.allowGuessedPrompts });
    addProperty_(properties, skipped, schema, context.titleProperty, record.file_name, 'file_name');
    addProperty_(properties, skipped, schema, context.fileIdProperty, record.file_id, 'file_id');
    addProperty_(properties, skipped, schema, context.driveUrlProperty, record.drive_url || buildDriveUrlFromFileId_(record.file_id), 'drive_url');
    ['Alt text', 'AI prompt', 'Prompt source text', 'Prompt source', 'Keywords', 'Asset type', 'Style family', 'Instructional purpose', 'Accessibility notes'].forEach(function(fieldName) {
      const field = metadata.fields[fieldName] || { value: '', sourceColumn: '', reason: 'no mapped metadata value available' };
      addProperty_(properties, skipped, schema, fieldName, field.value, field.sourceColumn, field.reason);
    });
    addControlledProperty_(properties, skipped, schema, 'Approved use', record, ['approved_use', 'source_approved_use', 'use_boundary', 'source_use_boundary']);
    addControlledProperty_(properties, skipped, schema, 'Reuse status', record, ['reuse_status', 'source_reuse_status', 'source_review_outcome']);
    addProperty_(properties, skipped, schema, 'Unit / lesson / material type', pickFirstSourceValue_(record, ['unit_lesson_material_type', 'unit_lesson_material', 'material_type', 'unit_name', 'lesson_name']).value, 'unit_lesson_material_type | unit_lesson_material | material_type | unit_name | lesson_name');
    addProperty_(properties, skipped, schema, 'Version', pickFirstSourceValue_(record, ['version', 'asset_version', 'source_version']).value, 'version | asset_version | source_version');
    addControlledProperty_(properties, skipped, schema, 'Cognitive load rating', record, ['reviewed_cognitive_load_rating', 'cognitive_load_rating', 'source_cognitive_load_rating']);
    if (!properties[context.titleProperty]) throw new Error('Blocked: Notion database is missing title property: ' + context.titleProperty);
    if (!properties[context.fileIdProperty]) throw new Error('Blocked: Notion database is missing file ID property: ' + context.fileIdProperty);
    return { properties: properties, skipped: skipped };
  }

  function addControlledProperty_(properties, skipped, schema, fieldName, record, sourceColumns) {
    const source = pickFirstSourceValue_(record, sourceColumns);
    const normalized = normalizeControlledValue_(fieldName, source.value, source.sourceColumn);
    addProperty_(properties, skipped, schema, fieldName, normalized.value, normalized.sourceColumn, normalized.reason);
  }

  function addProperty_(properties, skipped, schema, fieldName, value, sourceColumn, skipReason) {
    const propertySchema = schema[fieldName];
    const cleanValue = normalizeValue_(value);
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
  }

  function normalizeControlledValue_(fieldName, rawValue, sourceColumn) {
    const options = VisualAssetLibraryPromptMetadataService.CONTROLLED_OPTIONS[fieldName] || [];
    const value = String(rawValue || '').trim();
    if (!value) return { value: '', sourceColumn: sourceColumn || '', reason: 'no reviewed source value available' };
    if (options.indexOf(value) !== -1) return { value: value, sourceColumn: sourceColumn || '', reason: '' };
    const aliases = { approved: 'approved', source_approved: 'approved', draft: 'draft', needs_revision: 'needs revision', revision_needed: 'needs revision', retired: 'retired', worksheet: 'worksheet', slide: 'slide', poster: 'poster', student_facing: 'student-facing', teacher_facing: 'teacher-facing', low: 'low', medium: 'medium', med: 'medium', high: 'high' };
    const alias = aliases[normalize_(value)];
    if (alias && options.indexOf(alias) !== -1) return { value: alias, sourceColumn: sourceColumn || '', reason: '' };
    return { value: '', sourceColumn: sourceColumn || '', reason: 'source value is outside approved options: ' + value };
  }

  function validateNotionOption_(propertySchema, fieldName, value) {
    if (propertySchema.type !== 'select' && propertySchema.type !== 'status' && propertySchema.type !== 'multi_select') return { ok: true, reason: '' };
    const values = Array.isArray(value) ? value : [value];
    const approvedOptions = VisualAssetLibraryPromptMetadataService.CONTROLLED_OPTIONS[fieldName];
    const schemaOptions = getSchemaOptions_(propertySchema);
    const invalid = values.filter(function(item) {
      if (approvedOptions && approvedOptions.indexOf(item) === -1) return true;
      return schemaOptions.length && schemaOptions.indexOf(item) === -1;
    });
    if (invalid.length) return { ok: false, reason: 'value is outside approved/schema options: ' + invalid.join(', ') };
    return { ok: true, reason: '' };
  }

  function formatNotionProperty_(propertySchema, value) {
    const propertyType = propertySchema.type;
    const stringValue = String(value || '');
    if (propertyType === 'title') return { title: [{ text: { content: stringValue } }] };
    if (propertyType === 'rich_text') return { rich_text: buildRichTextItems_(stringValue) };
    if (propertyType === 'url') return { url: stringValue || null };
    if (propertyType === 'number') return { number: Number(value) };
    if (propertyType === 'date') return { date: stringValue ? { start: stringValue } : null };
    if (propertyType === 'select') return { select: stringValue ? { name: stringValue } : null };
    if (propertyType === 'status') return { status: stringValue ? { name: stringValue } : null };
    if (propertyType === 'multi_select') {
      const values = Array.isArray(value) ? value : String(value).split(/[,;\n]+/).map(function(item) { return item.trim(); }).filter(Boolean);
      return { multi_select: values.map(function(item) { return { name: String(item) }; }) };
    }
    if (propertyType === 'checkbox') return { checkbox: Boolean(value) };
    return { rich_text: buildRichTextItems_(stringValue) };
  }

  function buildRichTextItems_(value) {
    const text = String(value || '');
    if (!text) return [];
    const chunks = [];
    for (let start = 0; start < text.length; start += NOTION_RICH_TEXT_CHUNK_LENGTH) {
      chunks.push({ text: { content: text.slice(start, start + NOTION_RICH_TEXT_CHUNK_LENGTH) } });
    }
    return chunks;
  }

  function findExistingPageByFileId_(context, databaseId, schema, fileId) {
    const fileIdProperty = schema[context.fileIdProperty];
    if (!fileIdProperty) throw new Error('Blocked: Notion database is missing file ID property: ' + context.fileIdProperty);
    const filter = buildEqualsFilter_(context.fileIdProperty, fileIdProperty.type, fileId);
    const result = notionRequest_(context, 'post', '/databases/' + encodeURIComponent(databaseId) + '/query', { filter: filter, page_size: 2 });
    const pages = result.results || [];
    if (pages.length > 1) throw new Error('Blocked: duplicate Notion pages found for file_id ' + fileId);
    return pages[0] || null;
  }

  function getEligibility_(record) {
    if (!record.file_id || !record.drive_url || !record.file_name) return { eligible: false, reason: 'missing file_id, drive_url, or file_name' };
    if (isTruthy_(record.do_not_include)) return { eligible: false, reason: 'do_not_include is true' };
    if (String(record.blocked_reason || '').trim()) return { eligible: false, reason: 'blocked_reason is present' };
    if (normalize_(record.review_tier) === 'tier_4' || normalize_(record.review_tier) === '4') return { eligible: false, reason: 'Tier 4 is blocked' };
    if (record.notion_staging_eligible && !isTruthy_(record.notion_staging_eligible)) return { eligible: false, reason: 'notion_staging_eligible is not true' };
    if (normalize_(record.notion_staging_sync_status) === 'blocked') return { eligible: false, reason: 'notion_staging_sync_status is blocked' };
    return { eligible: true, reason: '' };
  }

  function buildEqualsFilter_(propertyName, propertyType, value) {
    if (propertyType === 'title') return { property: propertyName, title: { equals: String(value) } };
    if (propertyType === 'number') return { property: propertyName, number: { equals: Number(value) } };
    if (propertyType === 'url') return { property: propertyName, url: { equals: String(value) } };
    if (propertyType === 'select') return { property: propertyName, select: { equals: String(value) } };
    if (propertyType === 'status') return { property: propertyName, status: { equals: String(value) } };
    return { property: propertyName, rich_text: { equals: String(value) } };
  }

  function pickFirstSourceValue_(record, sourceNames) {
    for (let i = 0; i < sourceNames.length; i += 1) {
      const name = sourceNames[i];
      const value = String(record[name] || '').trim();
      if (value) return { value: value, sourceColumn: name };
    }
    return { value: '', sourceColumn: sourceNames.join(' | ') };
  }

  function getSchemaOptions_(propertySchema) { const type = propertySchema.type; if (!propertySchema[type] || !propertySchema[type].options) return []; return propertySchema[type].options.map(function(option) { return option.name; }); }
  function getDatabaseId_(context) { if (context.databaseId) return normalizeNotionId_(context.databaseId); const match = String(context.databaseUrl || '').match(/[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i); if (!match) throw new Error('Blocked: could not parse Notion database ID from URL.'); return normalizeNotionId_(match[0]); }
  function normalizeNotionId_(value) { return String(value || '').replace(/-/g, ''); }
  function buildDriveUrlFromFileId_(fileId) { const cleanFileId = String(fileId || '').trim(); return cleanFileId ? 'https://drive.google.com/file/d/' + cleanFileId + '/view' : ''; }
  function buildNotionPageUrl_(pageId) { const cleanId = String(pageId || '').replace(/-/g, ''); return cleanId ? 'https://www.notion.so/' + cleanId : ''; }
  function normalizeValue_(value) { if (Array.isArray(value)) return value.filter(function(item) { return String(item || '').trim(); }); if (value === null || value === undefined) return ''; return String(value).trim(); }
  function isTruthy_(value) { return ['true', 'yes', 'y', '1', 'eligible', 'approved'].indexOf(normalize_(value)) !== -1; }
  function normalize_(value) { return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

  function notionRequest_(context, method, path, body) {
    const options = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + context.notionToken, 'Notion-Version': NOTION_VERSION } };
    if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
    const response = UrlFetchApp.fetch(NOTION_API_BASE_URL + path, options);
    if (typeof Utilities !== 'undefined' && Utilities.sleep) Utilities.sleep(NOTION_REQUEST_DELAY_MS);
    const status = response.getResponseCode();
    const text = response.getContentText();
    if (status < 200 || status >= 300) throw new Error('Notion API error ' + status + ': ' + text);
    return text ? JSON.parse(text) : {};
  }

  return { syncEligibleBatch: syncEligibleBatch };
})();
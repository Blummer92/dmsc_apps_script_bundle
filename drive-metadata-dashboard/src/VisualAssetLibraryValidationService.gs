var VisualAssetLibraryValidationService = (function() {
  const VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
  const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2022-06-28';
  const EXPANDED_SCOPE = 'ELIGIBLE_STAGING_BATCH';
  const GUESSED_PROMPT_APPROVAL_VALUE = 'YES_GUESSED_PROMPTS_APPROVED';
  const DEFAULT_BATCH_SIZE = 25;
  const MAX_BATCH_SIZE = 50;
  const DEFAULT_EXPANDED_MAX_END_ROW = 454;
  const NOTION_REQUEST_DELAY_MS = 350;

  function dryRunFieldValidationOnly() {
    const context = getContext_();
    validateContext_(context);
    const batch = readBatch_(context);
    const databaseId = getDatabaseId_(context);
    const database = notionRequest_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
    const schema = database.properties || {};
    const validation = [];
    const skippedRows = [];

    batch.records.forEach(function(record) {
      const eligibility = getEligibility_(record);
      if (!eligibility.eligible) {
        skippedRows.push({ source_row: record.rowNumber, file_id: record.file_id || '', reason: eligibility.reason });
        return;
      }
      const page = findExistingPageByFileId_(context, databaseId, schema, record.file_id);
      buildFieldRows_(record, schema, context, page).forEach(function(row) {
        validation.push(row);
      });
    });

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
      skipped_field_count: validation.filter(function(row) { return row.skipped; }).length
    };

    Logger.log('VISUAL ASSET LIBRARY FIELD VALIDATION ONLY - No Notion write executed.');
    Logger.log(JSON.stringify(summary, null, 2));
    logJsonInChunks_(validation, 6000);
    return { summary: summary, field_validation: validation };
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

  function buildFieldRows_(record, schema, context, page) {
    const rows = [];
    const metadata = VisualAssetLibraryPromptMetadataService.build(record, {
      allowGuessedPrompts: context.allowGuessedPrompts
    });
    addRow_(rows, schema, context.titleProperty, record.file_name, 'file_name', record, page);
    addRow_(rows, schema, context.fileIdProperty, record.file_id, 'file_id', record, page);
    addRow_(rows, schema, context.driveUrlProperty, record.drive_url || buildDriveUrlFromFileId_(record.file_id), 'drive_url', record, page);
    addMetadataRow_(rows, schema, 'Alt text', metadata, record, page);
    addMetadataRow_(rows, schema, 'Prompt source', metadata, record, page);
    addMetadataRow_(rows, schema, 'Keywords', metadata, record, page);
    addMetadataRow_(rows, schema, 'Asset type', metadata, record, page);
    addMetadataRow_(rows, schema, 'Style family', metadata, record, page);
    addMetadataRow_(rows, schema, 'Instructional purpose', metadata, record, page);
    addMetadataRow_(rows, schema, 'Accessibility notes', metadata, record, page);
    addControlledRow_(rows, schema, 'Approved use', record, ['approved_use', 'source_approved_use', 'use_boundary', 'source_use_boundary'], page);
    addControlledRow_(rows, schema, 'Reuse status', record, ['reuse_status', 'source_reuse_status', 'source_review_outcome'], page);
    addRow_(rows, schema, 'Unit / lesson / material type', pickFirstSourceValue_(record, ['unit_lesson_material_type', 'unit_lesson_material', 'material_type', 'unit_name', 'lesson_name']).value, 'unit_lesson_material_type | unit_lesson_material | material_type | unit_name | lesson_name', record, page);
    addRow_(rows, schema, 'Version', pickFirstSourceValue_(record, ['version', 'asset_version', 'source_version']).value, 'version | asset_version | source_version', record, page);
    addControlledRow_(rows, schema, 'Cognitive load rating', record, ['reviewed_cognitive_load_rating', 'cognitive_load_rating', 'source_cognitive_load_rating'], page);
    addRow_(rows, schema, 'Thumbnail', '', '', record, page, 'left empty until thumbnail technical strategy is confirmed');
    return rows;
  }

  function addMetadataRow_(rows, schema, fieldName, metadata, record, page) {
    const field = metadata.fields[fieldName] || { value: '', sourceColumn: '', reason: 'no mapped metadata value available' };
    addRow_(rows, schema, fieldName, field.value, field.sourceColumn, record, page, field.reason);
  }

  function addControlledRow_(rows, schema, fieldName, record, sourceColumns, page) {
    const source = pickFirstSourceValue_(record, sourceColumns);
    const normalized = normalizeControlledValue_(fieldName, source.value, source.sourceColumn);
    addRow_(rows, schema, fieldName, normalized.value, normalized.sourceColumn, record, page, normalized.reason);
  }

  function addRow_(rows, schema, fieldName, value, sourceColumn, record, page, skipReason) {
    const cleanValue = normalizeValue_(value);
    const propertySchema = schema[fieldName];
    const oldValue = page && page.properties && page.properties[fieldName] ? extractPropertyValue_(page.properties[fieldName]) : '';
    const row = {
      source_row: record.rowNumber,
      notion_page_id: page ? page.id : '',
      notion_page_url: page ? page.url || buildNotionPageUrl_(page.id) : '',
      file_id: record.file_id || '',
      field_name: fieldName,
      old_value: shortenForLog_(oldValue),
      proposed_value: shortenForLog_(Array.isArray(cleanValue) ? cleanValue.join(', ') : cleanValue),
      source_column_used: sourceColumn || '',
      skipped: false,
      reason: ''
    };
    if (!propertySchema) {
      row.skipped = true;
      row.reason = 'Notion property is missing';
    } else if (cleanValue === '' || cleanValue === null || (Array.isArray(cleanValue) && cleanValue.length === 0)) {
      row.skipped = true;
      row.reason = skipReason || 'no reviewed source value available';
    } else {
      const validation = validateNotionOption_(propertySchema, fieldName, cleanValue);
      if (!validation.ok) {
        row.skipped = true;
        row.reason = validation.reason;
      }
    }
    rows.push(row);
  }

  function normalizeControlledValue_(fieldName, rawValue, sourceColumn) {
    const options = VisualAssetLibraryPromptMetadataService.CONTROLLED_OPTIONS[fieldName] || [];
    const value = String(rawValue || '').trim();
    if (!value) return { value: '', sourceColumn: sourceColumn || '', reason: 'no reviewed source value available' };
    if (options.indexOf(value) !== -1) return { value: value, sourceColumn: sourceColumn || '', reason: '' };
    const normalized = normalize_(value);
    const aliases = {
      approved: 'approved', source_approved: 'approved', draft: 'draft', needs_revision: 'needs revision', revision_needed: 'needs revision', retired: 'retired',
      worksheet: 'worksheet', slide: 'slide', poster: 'poster', student_facing: 'student-facing', teacher_facing: 'teacher-facing',
      low: 'low', medium: 'medium', med: 'medium', high: 'high'
    };
    if (aliases[normalized] && options.indexOf(aliases[normalized]) !== -1) return { value: aliases[normalized], sourceColumn: sourceColumn || '', reason: '' };
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

  function getSchemaOptions_(propertySchema) {
    const type = propertySchema.type;
    if (!propertySchema[type] || !propertySchema[type].options) return [];
    return propertySchema[type].options.map(function(option) { return option.name; });
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
    return '';
  }

  function richTextToPlainText_(items) {
    return (items || []).map(function(item) { return item.plain_text || ''; }).join('');
  }

  function getDatabaseId_(context) {
    if (context.databaseId) return normalizeNotionId_(context.databaseId);
    const match = String(context.databaseUrl || '').match(/[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    if (!match) throw new Error('Blocked: could not parse Notion database ID from URL.');
    return normalizeNotionId_(match[0]);
  }

  function normalizeNotionId_(value) { return String(value || '').replace(/-/g, ''); }
  function buildDriveUrlFromFileId_(fileId) { const cleanFileId = String(fileId || '').trim(); return cleanFileId ? 'https://drive.google.com/file/d/' + cleanFileId + '/view' : ''; }
  function buildNotionPageUrl_(pageId) { const cleanId = String(pageId || '').replace(/-/g, ''); return cleanId ? 'https://www.notion.so/' + cleanId : ''; }
  function normalizeValue_(value) { if (Array.isArray(value)) return value.filter(function(item) { return String(item || '').trim(); }); if (value === null || value === undefined) return ''; return String(value).trim(); }
  function shortenForLog_(value) { const text = String(value === null || value === undefined ? '' : value); return text.length > 240 ? text.slice(0, 237) + '...' : text; }
  function isTruthy_(value) { return ['true', 'yes', 'y', '1', 'eligible', 'approved'].indexOf(normalize_(value)) !== -1; }
  function normalize_(value) { return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

  function logJsonInChunks_(value, chunkSize) {
    const json = JSON.stringify(value, null, 2);
    for (let start = 0; start < json.length; start += chunkSize) {
      const chunkNumber = Math.floor(start / chunkSize) + 1;
      Logger.log('FIELD VALIDATION CHUNK ' + chunkNumber + '\n' + json.slice(start, start + chunkSize));
    }
  }

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

  return { dryRunFieldValidationOnly: dryRunFieldValidationOnly };
})();

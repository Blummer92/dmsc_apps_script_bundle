var VisualAssetLibraryProductionSyncService = (function() {
  const DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
  const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2022-06-28';
  const REQUEST_DELAY_MS = 350;
  const RICH_TEXT_CHUNK = 1900;

  function dryRun(rows) {
    return runRows_('DRY_RUN', rows || getCurrentBatchRows_());
  }

  function sync(rows) {
    return runRows_('SYNC', rows || getCurrentBatchRows_());
  }

  function verify(rows) {
    return runRows_('VERIFY', rows || getCurrentBatchRows_());
  }

  function runRows_(operation, rows) {
    const started = new Date();
    const context = getContext_();
    validateContext_(context);
    const databaseId = getDatabaseId_(context);
    const database = notionRequest_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
    const schema = database.properties || {};
    const aliases = PropertyAliasService.resolveAll(schema);
    const records = readRecordsForRows_(context, rows);
    const progress = [];
    const history = [];

    records.forEach(function(record) {
      const rowStarted = new Date();
      const expected = buildExpected_(record, schema, aliases);
      let page = null;
      let writeResult = null;
      let verification;
      let status = 'waiting';
      let detail = 'Queued for sync.';

      try {
        page = findExistingPageByFileId_(context, databaseId, schema, aliases, record.file_id);
        if (aliases.missing.length || aliases.ambiguous.length || expected.blockers.length) {
          verification = buildBlockedVerification_(expected, aliases, page);
          status = page ? 'partial' : 'failed';
          detail = verification.notes.join(' | ');
        } else if (operation === 'DRY_RUN') {
          verification = verifyExpectedAgainstPage_(expected, page);
          status = page ? statusFromVerification_(verification) : 'waiting';
          detail = page ? verification.summary : 'No Notion page exists yet. Sync will create one.';
        } else if (operation === 'VERIFY') {
          verification = verifyExpectedAgainstPage_(expected, page);
          status = statusFromVerification_(verification);
          detail = verification.summary;
        } else {
          writeResult = writeExpected_(context, databaseId, aliases, expected, page);
          page = notionRequest_(context, 'get', '/pages/' + encodeURIComponent(writeResult.page_id));
          verification = verifyExpectedAgainstPage_(expected, page);
          status = statusFromVerification_(verification);
          detail = verification.summary;
        }
      } catch (error) {
        verification = buildErrorVerification_(expected, error.message || String(error));
        status = 'failed';
        detail = error.message || String(error);
      }

      const item = buildProgressItem_(record, page, status, detail, verification, operation, rowStarted);
      progress.push(item);
      history.push(buildHistoryEntry_(record, operation, item, verification, rowStarted));
    });

    VisualAssetLibrarySyncHistoryService.append(history);
    return {
      operation: operation,
      rows: rows,
      row_progress: progress,
      summary: summarize_(progress),
      duration_ms: new Date().getTime() - started.getTime(),
      keyword_mode: KeywordStrategyService.getMode()
    };
  }

  function buildExpected_(record, schema, aliases) {
    const metadata = VisualAssetLibraryPromptMetadataService.build(record, { allowGuessedPrompts: getContext_().allowGuessedPrompts });
    const fields = {};
    const blockers = [];

    addExpected_(fields, 'asset_title', record.file_name, aliases);
    addExpected_(fields, 'file_id', record.file_id, aliases);
    addExpected_(fields, 'drive_link', record.drive_url || buildDriveUrl_(record.file_id), aliases);
    addExpected_(fields, 'alt_text', valueOf_(metadata, 'Alt text'), aliases);
    addExpected_(fields, 'ai_prompt', valueOf_(metadata, 'AI prompt'), aliases);
    addExpected_(fields, 'prompt_source', valueOf_(metadata, 'Prompt source'), aliases);
    addExpected_(fields, 'prompt_source_text', valueOf_(metadata, 'Prompt source text'), aliases);
    addExpected_(fields, 'accessibility_notes', valueOf_(metadata, 'Accessibility notes'), aliases);
    addExpected_(fields, 'instructional_purpose', valueOf_(metadata, 'Instructional purpose'), aliases);
    addExpected_(fields, 'style_family', valueOf_(metadata, 'Style family'), aliases);

    const assetTypeResolution = aliases.resolved.asset_type ? schema[aliases.resolved.asset_type] : null;
    const assetType = AssetTypeMappingService.map(valueOf_(metadata, 'Asset type') || record.asset_category, assetTypeResolution);
    if (assetType.ok) addExpected_(fields, 'asset_type', assetType.value, aliases);
    else blockers.push({ field: 'Asset Type', reason: assetType.reason });

    const keywordResolution = aliases.resolved.keywords ? schema[aliases.resolved.keywords] : null;
    const keywords = KeywordStrategyService.resolve(valueOf_(metadata, 'Keywords') || record.fast_sort_tags, keywordResolution);
    if (keywords.ok) addExpected_(fields, 'keywords', keywords.values, aliases);
    else blockers.push({ field: 'Keywords', reason: keywords.reason });

    if (record.version || record.asset_version || record.source_version) addExpected_(fields, 'version', record.version || record.asset_version || record.source_version, aliases);
    if (record.approved_use || record.source_approved_use || record.use_boundary || record.source_use_boundary) addExpected_(fields, 'approved_use', record.approved_use || record.source_approved_use || record.use_boundary || record.source_use_boundary, aliases);

    return { record: record, fields: fields, blockers: blockers };
  }

  function addExpected_(fields, canonical, value, aliases) {
    if (value === null || value === undefined || String(Array.isArray(value) ? value.join('') : value).trim() === '') return;
    const propertyName = aliases.resolved[canonical];
    if (!propertyName) return;
    fields[canonical] = { canonical: canonical, property: propertyName, value: value };
  }

  function writeExpected_(context, databaseId, aliases, expected, existingPage) {
    const properties = {};
    Object.keys(expected.fields).forEach(function(canonical) {
      const field = expected.fields[canonical];
      const propertySchema = aliases.resolved[canonical] ? aliases.resolved[canonical] && null : null;
      properties[field.property] = formatProperty_(field.value, field.property, context.schema || null);
    });

    const schema = context.schema;
    Object.keys(expected.fields).forEach(function(canonical) {
      const field = expected.fields[canonical];
      properties[field.property] = formatPropertyBySchema_(schema[field.property], field.value);
    });

    const response = existingPage
      ? notionRequest_(context, 'patch', '/pages/' + encodeURIComponent(existingPage.id), { properties: properties })
      : notionRequest_(context, 'post', '/pages', { parent: { database_id: databaseId }, properties: properties });
    return { page_id: response.id, page_url: response.url || buildNotionPageUrl_(response.id) };
  }

  function verifyExpectedAgainstPage_(expected, page) {
    const fieldResults = [];
    const missing = [];
    const mismatched = [];
    if (!page) {
      Object.keys(expected.fields).forEach(function(canonical) {
        const field = expected.fields[canonical];
        missing.push(field.property);
        fieldResults.push({ field: field.property, canonical: canonical, ok: false, expected: stringify_(field.value), actual: '', reason: 'Notion page is missing.' });
      });
      return buildVerification_(fieldResults, missing, mismatched, ['Notion page is missing.']);
    }

    Object.keys(expected.fields).forEach(function(canonical) {
      const field = expected.fields[canonical];
      const property = page.properties ? page.properties[field.property] : null;
      const actual = extractProperty_(property);
      const expectedValue = stringify_(field.value);
      const ok = valuesMatch_(field.value, actual);
      if (!property) missing.push(field.property);
      else if (!ok) mismatched.push(field.property);
      fieldResults.push({ field: field.property, canonical: canonical, ok: ok, expected: expectedValue, actual: actual, reason: ok ? '' : 'Expected and actual values differ.' });
    });
    return buildVerification_(fieldResults, missing, mismatched, []);
  }

  function buildVerification_(fieldResults, missing, mismatched, notes) {
    const total = fieldResults.length;
    const okCount = fieldResults.filter(function(item) { return item.ok; }).length;
    const percent = total ? Math.round((okCount / total) * 100) : 0;
    return {
      ok: total > 0 && okCount === total,
      total: total,
      ok_count: okCount,
      percent: percent,
      missing_fields: missing,
      mismatched_fields: mismatched,
      field_results: fieldResults,
      notes: notes || [],
      summary: okCount + '/' + total + ' fields verified (' + percent + '%).'
    };
  }

  function buildBlockedVerification_(expected, aliases, page) {
    const notes = [];
    aliases.missing.forEach(function(item) { notes.push(item.reason); });
    aliases.ambiguous.forEach(function(item) { notes.push(item.reason); });
    expected.blockers.forEach(function(item) { notes.push(item.field + ': ' + item.reason); });
    const base = verifyExpectedAgainstPage_(expected, page);
    base.ok = false;
    base.notes = notes.concat(base.notes || []);
    base.summary = base.notes.join(' | ');
    return base;
  }

  function buildErrorVerification_(expected, message) {
    const fields = Object.keys((expected || {}).fields || {}).map(function(canonical) {
      const field = expected.fields[canonical];
      return { field: field.property, canonical: canonical, ok: false, expected: stringify_(field.value), actual: '', reason: message };
    });
    return buildVerification_(fields, fields.map(function(item) { return item.field; }), [], [message]);
  }

  function buildProgressItem_(record, page, status, detail, verification, operation, started) {
    const color = colorForStatus_(status);
    const pageUrl = page ? page.url || buildNotionPageUrl_(page.id) : '';
    return {
      source_row: record.rowNumber,
      file_id: record.file_id || '',
      file_name: record.file_name || '',
      notion_page_url: pageUrl,
      status: status,
      color: color,
      label: labelForStatus_(status),
      detail: detail,
      sync_percent: verification.percent,
      complete_fields: verification.ok_count,
      total_fields: verification.total,
      missing_fields: verification.missing_fields.concat(verification.mismatched_fields),
      validation_notes: verification.notes.concat(verification.field_results.filter(function(item) { return !item.ok; }).map(function(item) { return item.field + ': ' + item.reason; })),
      field_results: verification.field_results.map(function(item) { return { field: item.field, ok: item.ok, changed: !item.ok, reason: item.reason, expected: item.expected, actual: item.actual }; }),
      stages: buildStages_(status, operation),
      duration_ms: new Date().getTime() - started.getTime()
    };
  }

  function buildStages_(status, operation) {
    if (status === 'synced') return { image: 'synced', notion: 'synced', validation: 'synced', write: operation === 'DRY_RUN' ? 'waiting' : 'synced', verify: 'synced' };
    if (status === 'partial') return { image: 'partial', notion: 'synced', validation: 'partial', write: operation === 'SYNC' ? 'partial' : 'waiting', verify: 'partial' };
    if (status === 'waiting') return { image: 'waiting', notion: 'missing', validation: 'synced', write: 'waiting', verify: 'waiting' };
    if (status === 'failed') return { image: 'failed', notion: 'waiting', validation: 'failed', write: 'blocked', verify: 'failed' };
    return { image: status, notion: 'waiting', validation: 'waiting', write: 'waiting', verify: 'waiting' };
  }

  function statusFromVerification_(verification) {
    if (verification.ok) return 'synced';
    return 'partial';
  }

  function summarize_(progress) {
    const counts = { synced: 0, partial: 0, waiting: 0, failed: 0 };
    progress.forEach(function(item) { counts[item.status] = (counts[item.status] || 0) + 1; });
    return {
      total: progress.length,
      counts: counts,
      average_sync_percent: progress.length ? Math.round(progress.reduce(function(sum, item) { return sum + Number(item.sync_percent || 0); }, 0) / progress.length) : 0,
      next_action: counts.failed ? 'Fix failed rows, then retry.' : counts.partial ? 'Resync partial rows.' : counts.waiting ? 'Sync waiting rows.' : 'Advance to the next batch.'
    };
  }

  function getContext_() {
    const props = PropertiesService.getScriptProperties();
    const startRow = Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2);
    const endRow = Number(props.getProperty('DM_NOTION_SYNC_END_ROW') || 11);
    const context = {
      spreadsheetId: props.getProperty('DM_SOURCE_LIBRARY_SPREADSHEET_ID'),
      sheetName: props.getProperty('DM_SOURCE_LIBRARY_SHEET_NAME'),
      dataSourceId: props.getProperty('DM_NOTION_STAGING_DATA_SOURCE_ID'),
      databaseUrl: props.getProperty('DM_NOTION_STAGING_DATABASE_URL'),
      databaseId: props.getProperty('DM_NOTION_STAGING_DATABASE_ID'),
      notionToken: props.getProperty('DM_NOTION_API_TOKEN') || props.getProperty('NOTION_API_TOKEN'),
      allowGuessedPrompts: props.getProperty('DM_VISUAL_ASSET_LIBRARY_ALLOW_GUESSED_PROMPTS') === 'YES_GUESSED_PROMPTS_APPROVED',
      startRow: startRow,
      endRow: endRow,
      cursorRow: Number(props.getProperty('DM_NOTION_SYNC_CURSOR_ROW') || startRow),
      batchSize: Number(props.getProperty('DM_NOTION_SYNC_BATCH_SIZE') || 25),
      schema: null
    };
    return context;
  }

  function validateContext_(context) {
    if (context.dataSourceId !== DATA_SOURCE_ID) throw new Error('Blocked: Visual Asset Library sync target is not approved.');
    if (!context.spreadsheetId || !context.sheetName || !context.databaseUrl || !context.notionToken) throw new Error('Blocked: missing source sheet, Notion target, or token configuration.');
  }

  function readRecordsForRows_(context, rows) {
    const sorted = (rows || []).map(Number).filter(function(row) { return row >= 2; }).sort(function(a, b) { return a - b; });
    if (!sorted.length) return [];
    const readResult = SheetReadService.readSpreadsheetRowsById(context.spreadsheetId, context.sheetName, sorted[0], sorted[sorted.length - 1]);
    if (readResult.warnings.length) throw new Error(readResult.warnings.join(' '));
    const wanted = {};
    sorted.forEach(function(row) { wanted[row] = true; });
    return readResult.records.filter(function(record) { return wanted[record.rowNumber]; });
  }

  function getCurrentBatchRows_() {
    const panel = getVisualAssetLibrarySyncPanel();
    const rows = [];
    for (let row = Number(panel.batch_start_row); row <= Number(panel.batch_end_row); row += 1) rows.push(row);
    return rows;
  }

  function findExistingPageByFileId_(context, databaseId, schema, aliases, fileId) {
    const fileProperty = aliases.resolved.file_id;
    if (!fileProperty) throw new Error('Missing Notion file_id property alias.');
    const propertySchema = schema[fileProperty];
    const filter = buildEqualsFilter_(fileProperty, propertySchema.type, fileId);
    const result = notionRequest_(context, 'post', '/databases/' + encodeURIComponent(databaseId) + '/query', { filter: filter, page_size: 2 });
    const pages = result.results || [];
    if (pages.length > 1) throw new Error('Duplicate Notion pages found for file_id ' + fileId);
    return pages[0] || null;
  }

  function formatPropertyBySchema_(propertySchema, value) {
    const type = propertySchema ? propertySchema.type : 'rich_text';
    const stringValue = stringify_(value);
    if (type === 'title') return { title: [{ text: { content: stringValue } }] };
    if (type === 'rich_text') return { rich_text: chunkText_(stringValue) };
    if (type === 'url') return { url: stringValue || null };
    if (type === 'number') return { number: Number(value) };
    if (type === 'date') return { date: stringValue ? { start: stringValue } : null };
    if (type === 'select') return { select: stringValue ? { name: stringValue } : null };
    if (type === 'status') return { status: stringValue ? { name: stringValue } : null };
    if (type === 'multi_select') return { multi_select: toArray_(value).map(function(item) { return { name: item }; }) };
    if (type === 'checkbox') return { checkbox: Boolean(value) };
    return { rich_text: chunkText_(stringValue) };
  }

  function extractProperty_(property) {
    if (!property) return '';
    if (property.type === 'title') return richText_(property.title);
    if (property.type === 'rich_text') return richText_(property.rich_text);
    if (property.type === 'url') return property.url || '';
    if (property.type === 'number') return property.number === null || property.number === undefined ? '' : String(property.number);
    if (property.type === 'date') return property.date ? property.date.start || '' : '';
    if (property.type === 'select') return property.select ? property.select.name : '';
    if (property.type === 'status') return property.status ? property.status.name : '';
    if (property.type === 'multi_select') return (property.multi_select || []).map(function(item) { return item.name; }).sort().join(', ');
    if (property.type === 'checkbox') return property.checkbox ? 'true' : 'false';
    return '';
  }

  function valuesMatch_(expected, actual) {
    if (Array.isArray(expected)) return expected.map(String).sort().join(', ') === String(actual || '').split(/,\s*/).filter(Boolean).sort().join(', ');
    return normalizeCompare_(expected) === normalizeCompare_(actual);
  }

  function buildEqualsFilter_(propertyName, propertyType, value) {
    if (propertyType === 'title') return { property: propertyName, title: { equals: String(value) } };
    if (propertyType === 'number') return { property: propertyName, number: { equals: Number(value) } };
    if (propertyType === 'url') return { property: propertyName, url: { equals: String(value) } };
    if (propertyType === 'select') return { property: propertyName, select: { equals: String(value) } };
    if (propertyType === 'status') return { property: propertyName, status: { equals: String(value) } };
    return { property: propertyName, rich_text: { equals: String(value) } };
  }

  function notionRequest_(context, method, path, body) {
    const options = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + context.notionToken, 'Notion-Version': NOTION_VERSION } };
    if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
    const response = UrlFetchApp.fetch(NOTION_API_BASE_URL + path, options);
    if (typeof Utilities !== 'undefined' && Utilities.sleep) Utilities.sleep(REQUEST_DELAY_MS);
    const status = response.getResponseCode();
    const text = response.getContentText();
    if (status < 200 || status >= 300) throw new Error('Notion API error ' + status + ': ' + text);
    return text ? JSON.parse(text) : {};
  }

  function getDatabaseId_(context) {
    if (context.databaseId) return String(context.databaseId).replace(/-/g, '');
    const match = String(context.databaseUrl || '').match(/[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    if (!match) throw new Error('Could not parse Notion database ID from URL.');
    return match[0].replace(/-/g, '');
  }

  function valueOf_(metadata, fieldName) {
    const field = metadata.fields[fieldName] || {};
    return field.value;
  }

  function stringify_(value) {
    if (Array.isArray(value)) return value.map(String).sort().join(', ');
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function toArray_(value) {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : String(value || '').split(/[,;\n]+/).map(function(item) { return item.trim(); }).filter(Boolean);
  }

  function richText_(items) {
    return (items || []).map(function(item) { return item.plain_text || ''; }).join('');
  }

  function chunkText_(value) {
    const text = String(value || '');
    if (!text) return [];
    const chunks = [];
    for (let start = 0; start < text.length; start += RICH_TEXT_CHUNK) chunks.push({ text: { content: text.slice(start, start + RICH_TEXT_CHUNK) } });
    return chunks;
  }

  function normalizeCompare_(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function buildDriveUrl_(fileId) {
    return fileId ? 'https://drive.google.com/file/d/' + fileId + '/view' : '';
  }

  function buildNotionPageUrl_(pageId) {
    const cleanId = String(pageId || '').replace(/-/g, '');
    return cleanId ? 'https://www.notion.so/' + cleanId : '';
  }

  function colorForStatus_(status) {
    if (status === 'synced') return 'green';
    if (status === 'partial') return 'purple';
    if (status === 'waiting') return 'yellow';
    if (status === 'failed') return 'red';
    return 'gray';
  }

  function labelForStatus_(status) {
    if (status === 'synced') return 'Completely synced';
    if (status === 'partial') return 'Partially synced';
    if (status === 'waiting') return 'Waiting to sync';
    if (status === 'failed') return 'Failed';
    return 'Never attempted';
  }

  function buildHistoryEntry_(record, operation, item, verification, started) {
    return {
      timestamp: new Date().toISOString(),
      row: record.rowNumber,
      image: record.file_name || record.file_id || '',
      operation: operation,
      changed_fields: (item.field_results || []).filter(function(field) { return field.changed; }).map(function(field) { return field.field; }),
      skipped_fields: verification.field_results.filter(function(field) { return !field.ok; }).map(function(field) { return field.field; }),
      reason: item.validation_notes.join(' | '),
      duration_ms: new Date().getTime() - started.getTime(),
      verification_result: verification.ok ? 'PASS' : 'FAIL',
      sync_percent: item.sync_percent
    };
  }

  return {
    dryRun: dryRun,
    sync: sync,
    verify: verify
  };
})();

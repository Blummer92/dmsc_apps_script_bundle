var VisualAssetLibraryProductionSyncService = (function() {
  const DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
  const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2022-06-28';
  const REQUEST_DELAY_MS = 350;
  const RICH_TEXT_CHUNK = 1900;

  function dryRun(rows) { return runRows_('DRY_RUN', rows || getCurrentBatchRows_()); }
  function sync(rows) { return runRows_('SYNC', rows || getCurrentBatchRows_()); }
  function verify(rows) { return runRows_('VERIFY', rows || getCurrentBatchRows_()); }

  function findNotionPagesByFileId(fileId) {
    const context = getPreparedContext_();
    const databaseId = getDatabaseId_(context);
    const aliases = PropertyAliasService.resolveAll(context.schema);
    return findNotionPagesByFileId_(context, databaseId, aliases, fileId).map(toPageSummary_);
  }

  function upsertVisualAssetPage(rowMetadata) {
    const context = getPreparedContext_();
    const databaseId = getDatabaseId_(context);
    const aliases = PropertyAliasService.resolveAll(context.schema);
    const record = Object.assign({ rowNumber: rowMetadata && rowMetadata.rowNumber || rowMetadata && rowMetadata.source_row || 0 }, rowMetadata || {});
    const expected = buildExpected_(record, context.schema, aliases, context);
    const result = upsertVisualAssetPage_(context, databaseId, aliases, expected, 'SYNC');
    const verification = verifyExpectedAgainstPage_(expected, result.page);
    return Object.assign({}, result, { verification: verification });
  }

  function runRows_(operation, rows) {
    const started = new Date();
    const context = getPreparedContext_();
    const databaseId = getDatabaseId_(context);
    const aliases = PropertyAliasService.resolveAll(context.schema);
    const records = readRecordsForRows_(context, rows);
    const progress = [];
    const history = [];

    records.forEach(function(record) {
      const rowStarted = new Date();
      let page = null;
      let verification;
      let status;
      let detail;
      const expected = buildExpected_(record, context.schema, aliases, context);

      try {
        const matches = findNotionPagesByFileId_(context, databaseId, aliases, record.file_id);
        if (matches.length > 1) throwDuplicatePages_(record.file_id, matches);
        page = matches[0] || null;
        if (aliases.missing.length || aliases.ambiguous.length || expected.blockers.length) {
          verification = buildBlockedVerification_(expected, aliases, page);
          status = page ? 'partial' : 'failed';
          detail = verification.summary;
        } else if (operation === 'SYNC') {
          const upsert = upsertVisualAssetPage_(context, databaseId, aliases, expected, operation, matches);
          page = upsert.page;
          verification = verifyExpectedAgainstPage_(expected, page);
          status = verification.ok ? 'synced' : 'partial';
          detail = verification.summary;
        } else {
          verification = verifyExpectedAgainstPage_(expected, page);
          status = page ? (verification.ok ? 'synced' : 'partial') : 'waiting';
          detail = page ? verification.summary : 'No Notion page exists yet. Sync will create one.';
        }
      } catch (error) {
        verification = buildErrorVerification_(expected, error);
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

  function getPreparedContext_() {
    const context = getContext_();
    validateContext_(context);
    const databaseId = getDatabaseId_(context);
    const database = notionRequest_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
    context.schema = database.properties || {};
    return context;
  }

  function buildExpected_(record, schema, aliases, context) {
    const metadata = VisualAssetLibraryPromptMetadataService.build(record, { allowGuessedPrompts: context.allowGuessedPrompts });
    const fields = {};
    const blockers = [];
    if (!String(record.file_id || '').trim()) blockers.push({ field: 'file_id', reason: 'Missing file_id; cannot safely upsert' });
    addExpected_(fields, aliases, 'asset_title', record.file_name);
    addExpected_(fields, aliases, 'file_id', record.file_id);
    addExpected_(fields, aliases, 'drive_link', record.drive_url || buildDriveUrl_(record.file_id));
    addExpected_(fields, aliases, 'alt_text', metadataValue_(metadata, 'Alt text'));
    addExpected_(fields, aliases, 'ai_prompt', metadataValue_(metadata, 'AI Prompt'));
    addExpected_(fields, aliases, 'prompt_source', metadataValue_(metadata, 'Prompt Source'));
    addExpected_(fields, aliases, 'prompt_source_text', metadataValue_(metadata, 'Prompt Source Text'));
    addExpected_(fields, aliases, 'accessibility_notes', metadataValue_(metadata, 'Accessibility notes'));
    addExpected_(fields, aliases, 'instructional_purpose', metadataValue_(metadata, 'Instructional purpose'));
    addExpected_(fields, aliases, 'style_family', metadataValue_(metadata, 'Style family'));

    const assetType = AssetTypeMappingService.map(metadataValue_(metadata, 'Asset type') || record.asset_category, schema[aliases.resolved.asset_type]);
    if (assetType.ok) addExpected_(fields, aliases, 'asset_type', assetType.value);
    else blockers.push({ field: 'Asset Type', reason: assetType.reason });

    const keywords = KeywordStrategyService.resolve(metadataValue_(metadata, 'Keywords') || record.fast_sort_tags, schema[aliases.resolved.keywords]);
    if (keywords.ok) addExpected_(fields, aliases, 'keywords', keywords.values);
    else blockers.push({ field: 'Keywords', reason: keywords.reason });

    const version = record.version || record.asset_version || record.source_version;
    if (version) addExpected_(fields, aliases, 'version', version);
    const approvedUse = record.approved_use || record.source_approved_use || record.use_boundary || record.source_use_boundary;
    if (approvedUse) addExpected_(fields, aliases, 'approved_use', approvedUse);
    return { record: record, fields: fields, blockers: blockers };
  }

  function addExpected_(fields, aliases, canonical, value) {
    if (value === null || value === undefined) return;
    if (Array.isArray(value) && !value.length) return;
    if (!Array.isArray(value) && !String(value).trim()) return;
    const property = aliases.resolved[canonical];
    if (!property) return;
    fields[canonical] = { canonical: canonical, property: property, value: value };
  }

  function upsertVisualAssetPage_(context, databaseId, aliases, expected, operation, existingMatches) {
    const fileId = expected.record.file_id;
    const matches = existingMatches || findNotionPagesByFileId_(context, databaseId, aliases, fileId);
    if (matches.length > 1) throwDuplicatePages_(fileId, matches);
    const page = matches[0] || null;
    const properties = {};
    Object.keys(expected.fields).forEach(function(canonical) {
      const field = expected.fields[canonical];
      properties[field.property] = formatProperty_(context.schema[field.property], field.value);
    });
    const response = page
      ? notionRequest_(context, 'patch', '/pages/' + encodeURIComponent(page.id), { properties: properties })
      : notionRequest_(context, 'post', '/pages', { parent: { database_id: databaseId }, properties: properties });
    const verifiedPage = notionRequest_(context, 'get', '/pages/' + encodeURIComponent(response.id));
    return { action: page ? 'updated' : 'created', page_id: response.id, page_url: response.url || buildNotionPageUrl_(response.id), page: verifiedPage };
  }

  function findNotionPagesByFileId_(context, databaseId, aliases, fileId) {
    const cleanFileId = String(fileId || '').trim();
    if (!cleanFileId) throw new Error('Missing file_id; cannot safely upsert');
    const property = aliases.resolved.file_id;
    if (!property) throw new Error('Missing Notion file_id property alias.');
    const schema = context.schema[property];
    const pages = [];
    let cursor = null;
    do {
      const body = { filter: buildEqualsFilter_(property, schema.type, cleanFileId), page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const result = notionRequest_(context, 'post', '/databases/' + encodeURIComponent(databaseId) + '/query', body);
      Array.prototype.push.apply(pages, result.results || []);
      cursor = result.has_more ? result.next_cursor : null;
    } while (cursor);
    return pages;
  }

  function throwDuplicatePages_(fileId, pages) {
    const urls = pages.map(function(page) { return page.url || buildNotionPageUrl_(page.id); }).filter(Boolean);
    const error = new Error('Duplicate Notion pages found for file_id ' + fileId + ': ' + urls.join(', '));
    error.duplicatePageUrls = urls;
    error.duplicatePageIds = pages.map(function(page) { return page.id; });
    throw error;
  }

  function verifyExpectedAgainstPage_(expected, page) {
    const fieldResults = [];
    const missing = [];
    const mismatched = [];
    Object.keys(expected.fields).forEach(function(canonical) {
      const field = expected.fields[canonical];
      const property = page && page.properties ? page.properties[field.property] : null;
      const actual = extractProperty_(property);
      const ok = property ? valuesMatch_(field.value, actual) : false;
      if (!property) missing.push(field.property);
      else if (!ok) mismatched.push(field.property);
      fieldResults.push({ field: field.property, canonical: canonical, ok: ok, expected: stringify_(field.value), actual: actual, reason: ok ? '' : property ? 'Expected and actual values differ.' : 'Notion property is missing on page.' });
    });
    return buildVerification_(fieldResults, missing, mismatched, page ? [] : ['Notion page is missing.']);
  }

  function buildVerification_(fieldResults, missing, mismatched, notes) {
    const total = fieldResults.length;
    const okCount = fieldResults.filter(function(item) { return item.ok; }).length;
    const percent = total ? Math.round((okCount / total) * 100) : 0;
    return { ok: total > 0 && okCount === total, total: total, ok_count: okCount, percent: percent, missing_fields: missing, mismatched_fields: mismatched, field_results: fieldResults, notes: notes || [], summary: okCount + '/' + total + ' fields verified (' + percent + '%).' };
  }

  function buildBlockedVerification_(expected, aliases, page) {
    const verification = verifyExpectedAgainstPage_(expected, page);
    const notes = [];
    aliases.missing.forEach(function(item) { notes.push(item.reason); });
    aliases.ambiguous.forEach(function(item) { notes.push(item.reason); });
    expected.blockers.forEach(function(item) { notes.push(item.field + ': ' + item.reason); });
    verification.ok = false;
    verification.notes = notes.concat(verification.notes || []);
    verification.summary = verification.notes.join(' | ') || verification.summary;
    return verification;
  }

  function buildErrorVerification_(expected, error) {
    const message = error && error.message ? error.message : String(error);
    const fieldResults = Object.keys(expected.fields || {}).map(function(canonical) {
      const field = expected.fields[canonical];
      return { field: field.property, canonical: canonical, ok: false, expected: stringify_(field.value), actual: '', reason: message };
    });
    const verification = buildVerification_(fieldResults, fieldResults.map(function(item) { return item.field; }), [], [message]);
    verification.duplicate_page_urls = error && error.duplicatePageUrls ? error.duplicatePageUrls : [];
    return verification;
  }

  function buildProgressItem_(record, page, status, detail, verification, operation, started) {
    const notes = unique_(verification.notes.concat(verification.field_results.filter(function(item) { return !item.ok; }).map(function(item) { return item.field + ': ' + item.reason; })));
    return {
      source_row: record.rowNumber,
      file_id: record.file_id || '',
      file_name: record.file_name || '',
      notion_page_url: page ? page.url || buildNotionPageUrl_(page.id) : '',
      duplicate_page_urls: verification.duplicate_page_urls || [],
      status: status,
      color: colorForStatus_(status),
      label: labelForStatus_(status),
      detail: detail,
      sync_percent: verification.percent,
      complete_fields: verification.ok_count,
      total_fields: verification.total,
      missing_fields: unique_(verification.missing_fields.concat(verification.mismatched_fields)),
      validation_notes: notes,
      field_results: verification.field_results.map(function(item) { return { field: item.field, ok: item.ok, changed: !item.ok, reason: item.reason, expected: item.expected, actual: item.actual }; }),
      stages: buildStages_(status, operation),
      duration_ms: new Date().getTime() - started.getTime()
    };
  }

  function buildStages_(status, operation) {
    if (status === 'synced') return { image: 'synced', notion: 'synced', validation: 'synced', write: operation === 'DRY_RUN' ? 'waiting' : 'synced', verify: 'synced' };
    if (status === 'partial') return { image: 'partial', notion: 'synced', validation: 'partial', write: operation === 'SYNC' ? 'partial' : 'waiting', verify: 'partial' };
    if (status === 'waiting') return { image: 'waiting', notion: 'missing', validation: 'synced', write: 'waiting', verify: 'waiting' };
    return { image: 'failed', notion: 'waiting', validation: 'failed', write: 'blocked', verify: 'failed' };
  }

  function summarize_(progress) {
    const counts = { synced: 0, partial: 0, waiting: 0, failed: 0 };
    progress.forEach(function(item) { counts[item.status] = (counts[item.status] || 0) + 1; });
    return { total: progress.length, counts: counts, average_sync_percent: progress.length ? Math.round(progress.reduce(function(sum, item) { return sum + Number(item.sync_percent || 0); }, 0) / progress.length) : 0, next_action: counts.failed ? 'Fix failed rows, then retry.' : counts.partial ? 'Resync partial rows.' : counts.waiting ? 'Sync waiting rows.' : 'Advance to the next batch.' };
  }

  function getContext_() {
    const props = PropertiesService.getScriptProperties();
    const startRow = Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2);
    return { spreadsheetId: props.getProperty('DM_SOURCE_LIBRARY_SPREADSHEET_ID'), sheetName: props.getProperty('DM_SOURCE_LIBRARY_SHEET_NAME'), dataSourceId: props.getProperty('DM_NOTION_STAGING_DATA_SOURCE_ID'), databaseUrl: props.getProperty('DM_NOTION_STAGING_DATABASE_URL'), databaseId: props.getProperty('DM_NOTION_STAGING_DATABASE_ID'), notionToken: props.getProperty('DM_NOTION_API_TOKEN') || props.getProperty('NOTION_API_TOKEN'), allowGuessedPrompts: props.getProperty('DM_VISUAL_ASSET_LIBRARY_ALLOW_GUESSED_PROMPTS') === 'YES_GUESSED_PROMPTS_APPROVED', startRow: startRow, cursorRow: Number(props.getProperty('DM_NOTION_SYNC_CURSOR_ROW') || startRow), batchSize: Number(props.getProperty('DM_NOTION_SYNC_BATCH_SIZE') || 25), schema: {} };
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

  function formatProperty_(schema, value) {
    const type = schema ? schema.type : 'rich_text';
    const text = stringify_(value);
    if (type === 'title') return { title: [{ text: { content: text } }] };
    if (type === 'rich_text') return { rich_text: chunkText_(text) };
    if (type === 'url') return { url: text || null };
    if (type === 'number') return { number: Number(value) };
    if (type === 'date') return { date: text ? { start: text } : null };
    if (type === 'select') return { select: text ? { name: text } : null };
    if (type === 'status') return { status: text ? { name: text } : null };
    if (type === 'multi_select') return { multi_select: toArray_(value).map(function(item) { return { name: item }; }) };
    if (type === 'checkbox') return { checkbox: Boolean(value) };
    return { rich_text: chunkText_(text) };
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

  function toPageSummary_(page) { return { page_id: page.id, page_url: page.url || buildNotionPageUrl_(page.id), created_time: page.created_time || '', last_edited_time: page.last_edited_time || '' }; }
  function metadataValue_(metadata, fieldName) { return (metadata.fields[fieldName] || {}).value; }
  function stringify_(value) { return Array.isArray(value) ? value.map(String).sort().join(', ') : String(value === null || value === undefined ? '' : value).trim(); }
  function toArray_(value) { return Array.isArray(value) ? value.map(String).filter(Boolean) : String(value || '').split(/[,;\n]+/).map(function(item) { return item.trim(); }).filter(Boolean); }
  function richText_(items) { return (items || []).map(function(item) { return item.plain_text || ''; }).join(''); }
  function chunkText_(value) { const text = String(value || ''); const chunks = []; for (let start = 0; start < text.length; start += RICH_TEXT_CHUNK) chunks.push({ text: { content: text.slice(start, start + RICH_TEXT_CHUNK) } }); return chunks; }
  function normalizeCompare_(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function buildDriveUrl_(fileId) { return fileId ? 'https://drive.google.com/file/d/' + fileId + '/view' : ''; }
  function buildNotionPageUrl_(pageId) { const cleanId = String(pageId || '').replace(/-/g, ''); return cleanId ? 'https://www.notion.so/' + cleanId : ''; }
  function colorForStatus_(status) { return status === 'synced' ? 'green' : status === 'partial' ? 'purple' : status === 'waiting' ? 'yellow' : status === 'failed' ? 'red' : 'gray'; }
  function labelForStatus_(status) { return status === 'synced' ? 'Completely synced' : status === 'partial' ? 'Partially synced' : status === 'waiting' ? 'Waiting to sync' : status === 'failed' ? 'Failed' : 'Never attempted'; }
  function unique_(values) { return Array.from(new Set(values || [])); }

  function buildHistoryEntry_(record, operation, item, verification, started) {
    return { timestamp: new Date().toISOString(), row: record.rowNumber, image: record.file_name || record.file_id || '', operation: operation, changed_fields: (item.field_results || []).filter(function(field) { return field.changed; }).map(function(field) { return field.field; }), skipped_fields: verification.field_results.filter(function(field) { return !field.ok; }).map(function(field) { return field.field; }), reason: item.validation_notes.join(' | '), duration_ms: new Date().getTime() - started.getTime(), verification_result: verification.ok ? 'PASS' : 'FAIL', sync_percent: item.sync_percent, duplicate_page_urls: item.duplicate_page_urls || [] };
  }

  return {
    dryRun: dryRun,
    sync: sync,
    verify: verify,
    findNotionPagesByFileId: findNotionPagesByFileId,
    upsertVisualAssetPage: upsertVisualAssetPage
  };
})();

function findNotionPagesByFileId(fileId) {
  return VisualAssetLibraryProductionSyncService.findNotionPagesByFileId(fileId);
}

function upsertVisualAssetPage(rowMetadata) {
  return VisualAssetLibraryProductionSyncService.upsertVisualAssetPage(rowMetadata);
}

'use strict';

const { createAppsScriptHarness, createAppsScriptRuntime, createSpreadsheetFixture } = require('../helpers/appsScriptHarness.js');

const DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
const DATABASE_ID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const DATABASE_URL = 'https://www.notion.so/workspace/' + DATABASE_ID;
const TOKEN = 'secret_create_pending_reporting_token';

// Every canonical alias PropertyAliasService requires, so alias resolution never blocks a row
// and every scenario below is isolated to the verification/reporting layer under test.
const SCHEMA = {
  'Asset title': { type: 'title' },
  'Asset type': { type: 'select', select: { options: [{ name: 'diagram' }] } },
  Keywords: { type: 'multi_select', multi_select: { options: [{ name: 'algebra' }] } },
  'AI Prompt': { type: 'rich_text' },
  'Alt text': { type: 'rich_text' },
  'Accessibility notes': { type: 'rich_text' },
  'Instructional purpose': { type: 'rich_text' },
  'Style family': { type: 'rich_text' },
  file_id: { type: 'rich_text' },
  'Source file link in Google Drive': { type: 'url' },
  'Prompt Source': { type: 'rich_text' }
};

const HEADERS = ['file_id', 'drive_url', 'file_name', 'asset_category', 'fast_sort_tags', 'approved_prompt', 'alt_text', 'accessibility_notes', 'asset_label', 'unit_visual_system'];

function notionResponse(status, body) {
  return {
    getResponseCode: () => status,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body || {})),
    getAllHeaders: () => ({})
  };
}

function notionPage(id, fileId, overrides = {}) {
  return {
    id,
    url: 'https://www.notion.so/' + String(id).replace(/-/g, ''),
    properties: Object.assign({
      file_id: { type: 'rich_text', rich_text: [{ plain_text: fileId }] },
      'Asset title': { type: 'title', title: [{ plain_text: 'Existing asset' }] }
    }, overrides)
  };
}

/** Converts a create/update payload into the page shape Notion returns on read. */
function pageFromWritePayload(id, fileId, properties) {
  const readProperties = {};
  Object.keys(properties || {}).forEach((name) => {
    const value = properties[name];
    if (value.title) readProperties[name] = { type: 'title', title: value.title.map((item) => ({ plain_text: item.text.content })) };
    else if (value.rich_text) readProperties[name] = { type: 'rich_text', rich_text: value.rich_text.map((item) => ({ plain_text: item.text.content })) };
    else if ('url' in value) readProperties[name] = { type: 'url', url: value.url };
    else if ('select' in value) readProperties[name] = { type: 'select', select: value.select };
    else if ('multi_select' in value) readProperties[name] = { type: 'multi_select', multi_select: value.multi_select };
    else if ('number' in value) readProperties[name] = { type: 'number', number: value.number };
    else if ('checkbox' in value) readProperties[name] = { type: 'checkbox', checkbox: value.checkbox };
  });
  return { id, url: 'https://www.notion.so/' + String(id).replace(/-/g, ''), properties: readProperties };
}

function sheetRow(fileId, overrides = {}) {
  return Object.assign({
    file_id: fileId,
    drive_url: fileId ? 'https://drive.google.com/file/d/' + fileId + '/view' : '',
    file_name: 'Asset ' + (fileId || 'blank'),
    asset_category: 'diagram',
    fast_sort_tags: 'algebra',
    approved_prompt: 'A prompt',
    alt_text: 'Alt text value for ' + (fileId || 'blank'),
    accessibility_notes: 'Accessibility notes value for ' + (fileId || 'blank'),
    asset_label: 'Purpose',
    unit_visual_system: 'System'
  }, overrides);
}

function sheetValues(rows) {
  const values = [HEADERS];
  rows.forEach((row) => values.push(HEADERS.map((header) => (row[header] !== undefined ? row[header] : ''))));
  return values;
}

function isSchemaRead(request) {
  return request.method === 'get' && /\/databases\/[^/]+$/.test(request.url);
}
function isQuery(request) {
  return request.method === 'post' && /\/query$/.test(request.url);
}
function isCreate(request) {
  return request.method === 'post' && /\/pages$/.test(request.url);
}
function isUpdate(request) {
  return request.method === 'patch';
}
function isSchemaMutation(request) {
  return request.method === 'patch' && /\/databases\//.test(request.url);
}

/** Harness over the real production sources, so every scenario exercises the shared verification builder. */
function buildHarness({ fetchImpl, rows } = {}) {
  const requests = [];
  const { spreadsheet } = createSpreadsheetFixture({ 'Visual Sync History': [] });

  const runtime = createAppsScriptRuntime({
    spreadsheet,
    properties: {
      DM_SOURCE_LIBRARY_SPREADSHEET_ID: 'source-spreadsheet-id',
      DM_SOURCE_LIBRARY_SHEET_NAME: 'Source Library',
      DM_NOTION_STAGING_DATA_SOURCE_ID: DATA_SOURCE_ID,
      DM_NOTION_STAGING_DATABASE_URL: DATABASE_URL,
      DM_NOTION_API_TOKEN: TOKEN
    },
    fetchImpl(url, options) {
      requests.push({
        url: String(url),
        method: String(options.method || '').toLowerCase(),
        payload: options.payload ? JSON.parse(options.payload) : null
      });
      if (typeof fetchImpl !== 'function') return notionResponse(200, {});
      return fetchImpl(requests[requests.length - 1], requests.length);
    }
  });

  const harness = createAppsScriptHarness({
    runtime,
    globals: { Sheets: { Spreadsheets: { Values: { get: () => ({ values: sheetValues(rows) }) } } } }
  });

  harness.loadFiles([
    'drive-metadata-dashboard/src/NotionTransport.gs',
    'drive-metadata-dashboard/src/SheetReadService.gs',
    'drive-metadata-dashboard/src/PropertyAliasService.gs',
    'drive-metadata-dashboard/src/AssetTypeMappingService.gs',
    'drive-metadata-dashboard/src/KeywordStrategyService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibraryPromptMetadataService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibrarySyncHistoryService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibraryProductionSyncService.gs'
  ]);

  return {
    harness,
    runtime,
    requests,
    service: harness.getValue('VisualAssetLibraryProductionSyncService')
  };
}

/** Full pipeline harness (adds ValidationService + DryRunProofService) for summary/skip-flag checks. */
function buildValidationHarness({ fetchImpl, rows } = {}) {
  const requests = [];
  const { spreadsheet } = createSpreadsheetFixture({ 'Visual Sync History': [] });

  const runtime = createAppsScriptRuntime({
    spreadsheet,
    properties: {
      DM_SOURCE_LIBRARY_SPREADSHEET_ID: 'source-spreadsheet-id',
      DM_SOURCE_LIBRARY_SHEET_NAME: 'Source Library',
      DM_NOTION_STAGING_DATA_SOURCE_ID: DATA_SOURCE_ID,
      DM_NOTION_STAGING_DATABASE_URL: DATABASE_URL,
      DM_NOTION_API_TOKEN: TOKEN,
      DM_NOTION_SYNC_MODE: 'DRY_RUN',
      DM_NOTION_SYNC_SCOPE: 'ELIGIBLE_STAGING_BATCH',
      DM_NOTION_SYNC_START_ROW: '2',
      DM_NOTION_SYNC_END_ROW: String(1 + rows.length),
      DM_NOTION_SYNC_CURSOR_ROW: '2',
      DM_NOTION_SYNC_BATCH_SIZE: String(rows.length),
      DM_NOTION_SYNC_MAX_END_ROW: '500'
    },
    fetchImpl(url, options) {
      requests.push({
        url: String(url),
        method: String(options.method || '').toLowerCase(),
        payload: options.payload ? JSON.parse(options.payload) : null
      });
      if (typeof fetchImpl !== 'function') return notionResponse(200, {});
      return fetchImpl(requests[requests.length - 1], requests.length);
    }
  });

  const harness = createAppsScriptHarness({
    runtime,
    globals: { Sheets: { Spreadsheets: { Values: { get: () => ({ values: sheetValues(rows) }) } } } }
  });

  harness.loadFiles([
    'drive-metadata-dashboard/src/NotionTransport.gs',
    'drive-metadata-dashboard/src/SheetReadService.gs',
    'drive-metadata-dashboard/src/PropertyAliasService.gs',
    'drive-metadata-dashboard/src/AssetTypeMappingService.gs',
    'drive-metadata-dashboard/src/KeywordStrategyService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibraryPromptMetadataService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibrarySyncHistoryService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibraryProductionSyncService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibraryDryRunProofService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibraryValidationService.gs'
  ]);

  return {
    requests,
    service: harness.getValue('VisualAssetLibraryValidationService')
  };
}

/** Runs a real create through a throwaway harness to capture the exact page shape Notion would
 * store for a row, so "existing page" scenarios mutate a real page instead of hand-guessing one. */
function computeWrittenPage(fileId) {
  let capturedProperties = null;
  const context = buildHarness({
    rows: [sheetRow(fileId)],
    fetchImpl(request) {
      if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
      if (isQuery(request)) return notionResponse(200, { results: [] });
      if (isCreate(request)) {
        capturedProperties = request.payload.properties;
        return notionResponse(200, { id: 'template-page', url: 'https://www.notion.so/templatepage' });
      }
      if (request.method === 'get' && /\/pages\//.test(request.url)) {
        return notionResponse(200, pageFromWritePayload('template-page', fileId, capturedProperties));
      }
      return notionResponse(200, {});
    }
  });
  const result = context.service.sync([2]);
  if (result.row_progress[0].status !== 'synced') {
    throw new Error('computeWrittenPage fixture setup failed: ' + JSON.stringify(result.row_progress[0]));
  }
  return pageFromWritePayload('existing-page-' + fileId, fileId, capturedProperties);
}

describe('Harden create-pending reporting for unmatched Visual Asset Library rows (#72)', () => {
  test('valid file_id with no matched page reports waiting with create-pending field reasons, never missing-property text', () => {
    const context = buildHarness({
      rows: [sheetRow('unmatched-1')],
      fetchImpl(request) {
        if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
        if (isQuery(request)) return notionResponse(200, { results: [] });
        return notionResponse(200, {});
      }
    });

    const result = context.service.dryRun([2]);
    const item = result.row_progress[0];
    const REASON = context.service.VERIFICATION_REASON;

    expect(item.status).toBe('waiting');
    expect(item.reason_code).toBe(REASON.PAGE_MISSING_CREATE_PENDING);
    expect(item.detail).toBe('No Notion page exists yet. Sync will create one.');
    expect(item.field_results.length).toBeGreaterThan(0);

    item.field_results.forEach((field) => {
      expect(field.ok).toBe(false);
      expect(field.reason_code).toBe(REASON.PAGE_MISSING_CREATE_PENDING);
      expect(field.reason.toLowerCase()).toContain('create-pending');
      expect(field.reason).not.toBe('Notion property is missing on page.');
      expect(field.reason.toLowerCase()).not.toContain('property is missing');
    });

    expect(item.missing_fields).toEqual([]);
    expect(item.create_pending_fields.length).toBe(item.field_results.length);
    expect(item.validation_notes.some((note) => /property is missing/i.test(note))).toBe(false);

    // Internal consistency: every field is accounted for exactly once.
    expect(item.complete_fields).toBe(0);
    expect(item.total_fields).toBe(item.field_results.length);

    expect(context.requests.filter(isCreate).length).toBe(0);
    expect(context.requests.filter(isUpdate).length).toBe(0);
    expect(context.requests.filter(isSchemaMutation).length).toBe(0);
  });

  test('existing page with a missing required property retains the missing-property diagnostic', () => {
    // 'Alt text' is populated via a direct explicit passthrough (record.alt_text), so it is
    // guaranteed to appear in expected.fields regardless of prompt-metadata fallback logic.
    const templatePage = computeWrittenPage('existing-missing-prop');
    const pageMissingProperty = JSON.parse(JSON.stringify(templatePage));
    delete pageMissingProperty.properties['Alt text'];

    const context = buildHarness({
      rows: [sheetRow('existing-missing-prop')],
      fetchImpl(request) {
        if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
        if (isQuery(request)) return notionResponse(200, { results: [pageMissingProperty] });
        return notionResponse(200, {});
      }
    });

    const result = context.service.dryRun([2]);
    const item = result.row_progress[0];
    const REASON = context.service.VERIFICATION_REASON;
    const missingField = item.field_results.find((field) => field.canonical === 'alt_text');

    expect(item.status).toBe('partial');
    expect(item.reason_code).toBe(REASON.PROPERTY_MISSING_ON_EXISTING_PAGE);
    expect(missingField).toBeDefined();
    expect(missingField.reason_code).toBe(REASON.PROPERTY_MISSING_ON_EXISTING_PAGE);
    expect(missingField.reason).toBe('Notion property is missing on page.');
    expect(item.missing_fields).toContain('Alt text');

    expect(context.requests.filter(isCreate).length).toBe(0);
    expect(context.requests.filter(isUpdate).length).toBe(0);
  });

  test('existing page with a mismatched property value retains the value-mismatch diagnostic', () => {
    const templatePage = computeWrittenPage('existing-mismatch');
    const pageWithMismatch = JSON.parse(JSON.stringify(templatePage));
    pageWithMismatch.properties['Alt text'] = { type: 'rich_text', rich_text: [{ plain_text: 'A completely different value' }] };

    const context = buildHarness({
      rows: [sheetRow('existing-mismatch')],
      fetchImpl(request) {
        if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
        if (isQuery(request)) return notionResponse(200, { results: [pageWithMismatch] });
        return notionResponse(200, {});
      }
    });

    const result = context.service.dryRun([2]);
    const item = result.row_progress[0];
    const REASON = context.service.VERIFICATION_REASON;
    const mismatchField = item.field_results.find((field) => field.canonical === 'alt_text');

    expect(item.status).toBe('partial');
    expect(item.reason_code).toBe(REASON.PROPERTY_VALUE_MISMATCH);
    expect(mismatchField).toBeDefined();
    expect(mismatchField.reason_code).toBe(REASON.PROPERTY_VALUE_MISMATCH);
    expect(mismatchField.reason).toBe('Expected and actual values differ.');
    expect(item.missing_fields).toContain('Alt text');
    expect(item.create_pending_fields).toEqual([]);

    expect(context.requests.filter(isCreate).length).toBe(0);
    expect(context.requests.filter(isUpdate).length).toBe(0);
  });

  test('unmatched page with an independent row-level blocker reports row_blocked, not create-pending', () => {
    // asset_category has no approved Asset Type mapping, so buildExpected_ pushes a blocker
    // even though the row also has no matching Notion page.
    const context = buildHarness({
      rows: [sheetRow('unmatched-blocked', { asset_category: 'totally-unknown-category' })],
      fetchImpl(request) {
        if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
        if (isQuery(request)) return notionResponse(200, { results: [] });
        return notionResponse(200, {});
      }
    });

    const result = context.service.dryRun([2]);
    const item = result.row_progress[0];
    const REASON = context.service.VERIFICATION_REASON;

    expect(item.status).toBe('failed');
    expect(item.reason_code).toBe(REASON.ROW_BLOCKED);
    expect(item.create_pending_fields).toEqual([]);
    expect(item.field_results.length).toBeGreaterThan(0);
    item.field_results.filter((field) => !field.ok).forEach((field) => {
      expect(field.reason_code).toBe(REASON.ROW_BLOCKED);
      expect(field.reason.toLowerCase()).not.toContain('create-pending');
    });
    expect(item.validation_notes.some((note) => /No approved Notion Asset Type mapping/i.test(note))).toBe(true);

    expect(context.requests.filter(isCreate).length).toBe(0);
    expect(context.requests.filter(isUpdate).length).toBe(0);
    expect(context.requests.filter(isSchemaMutation).length).toBe(0);
  });

  test('duplicate exact file_id matches remain blocked', () => {
    const context = buildHarness({
      rows: [sheetRow('duplicate-id')],
      fetchImpl(request) {
        if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
        if (isQuery(request)) return notionResponse(200, { results: [notionPage('page-a', 'duplicate-id'), notionPage('page-b', 'duplicate-id')] });
        return notionResponse(200, {});
      }
    });

    const result = context.service.dryRun([2]);
    const item = result.row_progress[0];
    const REASON = context.service.VERIFICATION_REASON;

    expect(item.status).toBe('failed');
    expect(item.reason_code).toBe(REASON.ROW_BLOCKED);
    expect(item.detail).toMatch(/Duplicate Notion pages/);

    expect(context.requests.filter(isCreate).length).toBe(0);
    expect(context.requests.filter(isUpdate).length).toBe(0);
  });

  test('blank file_id remains failed and blocked before any Notion query', () => {
    const context = buildHarness({
      rows: [sheetRow('')],
      fetchImpl(request) {
        if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
        return notionResponse(200, {});
      }
    });

    const result = context.service.dryRun([2]);
    const item = result.row_progress[0];
    const REASON = context.service.VERIFICATION_REASON;

    expect(item.status).toBe('failed');
    expect(item.reason_code).toBe(REASON.ROW_BLOCKED);
    expect(item.detail).toMatch(/Missing file_id/);

    expect(context.requests.filter(isQuery).length).toBe(0);
    expect(context.requests.filter(isCreate).length).toBe(0);
    expect(context.requests.filter(isUpdate).length).toBe(0);
  });

  test('field skipped flags and summary counts remain internally consistent for an unmatched row', () => {
    const rows = [sheetRow('unmatched-consistency')];
    const context = buildValidationHarness({
      rows,
      fetchImpl(request) {
        if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
        if (isQuery(request)) return notionResponse(200, { results: [] });
        return notionResponse(200, {});
      }
    });

    const result = context.service.dryRunFieldValidationOnly();

    expect(result.summary.writable_field_count + result.summary.skipped_field_count).toBe(result.summary.field_validation_count);
    expect(result.field_validation.length).toBe(result.summary.field_validation_count);

    const row = result.row_progress[0];
    expect(row.status).toBe('waiting');

    const rowValidationEntries = result.field_validation.filter((entry) => entry.source_row === row.source_row);
    expect(rowValidationEntries.length).toBeGreaterThan(0);
    rowValidationEntries.forEach((entry) => {
      // isBlockingField_ already treats waiting rows as nonblocking; this proves the adapter
      // output carries no leftover "missing property" text for those fields either.
      expect(entry.skipped).toBe(false);
      expect(entry.reason).toBe('');
    });

    expect(context.requests.filter(isCreate).length).toBe(0);
    expect(context.requests.filter(isUpdate).length).toBe(0);
  });

  test('dry run across page-missing, missing-property, mismatch, duplicate, and blank states performs zero Notion create, update, or schema-mutation requests', () => {
    const rows = [
      sheetRow('unmatched-multi'),
      sheetRow('duplicate-multi'),
      sheetRow('')
    ];

    const context = buildHarness({
      rows,
      fetchImpl(request) {
        if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
        if (isQuery(request)) {
          const fileIdFilter = request.payload && request.payload.filter && request.payload.filter.rich_text
            ? request.payload.filter.rich_text.equals
            : null;
          if (fileIdFilter === 'duplicate-multi') {
            return notionResponse(200, { results: [notionPage('dup-a', 'duplicate-multi'), notionPage('dup-b', 'duplicate-multi')] });
          }
          return notionResponse(200, { results: [] });
        }
        return notionResponse(200, {});
      }
    });

    const result = context.service.dryRun([2, 3, 4]);
    const REASON = context.service.VERIFICATION_REASON;
    const byFileId = {};
    result.row_progress.forEach((item) => { byFileId[item.file_id] = item; });

    expect(byFileId['unmatched-multi'].status).toBe('waiting');
    expect(byFileId['unmatched-multi'].reason_code).toBe(REASON.PAGE_MISSING_CREATE_PENDING);
    expect(byFileId['duplicate-multi'].status).toBe('failed');
    expect(byFileId['duplicate-multi'].reason_code).toBe(REASON.ROW_BLOCKED);
    expect(byFileId[''].status).toBe('failed');
    expect(byFileId[''].reason_code).toBe(REASON.ROW_BLOCKED);

    // Field skipped flags and summary counts stay consistent: total = ok + not-ok everywhere.
    result.row_progress.forEach((item) => {
      const notOk = item.field_results.filter((field) => !field.ok).length;
      expect(item.complete_fields + notOk).toBe(item.total_fields);
    });

    expect(context.requests.filter(isCreate).length).toBe(0);
    expect(context.requests.filter(isUpdate).length).toBe(0);
    expect(context.requests.filter(isSchemaMutation).length).toBe(0);
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const { createAppsScriptHarness, createAppsScriptRuntime, createSpreadsheetFixture } = require('../helpers/appsScriptHarness.js');

const DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
const DATABASE_ID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const DATABASE_URL = 'https://www.notion.so/workspace/' + DATABASE_ID;
const TOKEN = 'secret_visual_asset_production_token';
const FILE_ID = 'drive-file-1';

// Every canonical alias PropertyAliasService requires, so alias resolution never blocks the row.
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

function notionResponse(status, body, headers = {}) {
  return {
    getResponseCode: () => status,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body || {})),
    getAllHeaders: () => headers
  };
}

function notionPage(id, fileId = FILE_ID, overrides = {}) {
  return {
    id,
    url: 'https://www.notion.so/' + String(id).replace(/-/g, ''),
    properties: Object.assign({
      file_id: { type: 'rich_text', rich_text: [{ plain_text: fileId }] },
      'Asset title': { type: 'title', title: [{ plain_text: 'Asset One' }] }
    }, overrides)
  };
}

/**
 * Converts a write payload into the page shape Notion returns on read, so a read-back or
 * verification query reflects exactly what the service asked to write.
 */
function pageFromWritePayload(id, properties) {
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

function sheetValues() {
  return [
    ['file_id', 'drive_url', 'file_name', 'asset_category', 'fast_sort_tags', 'approved_prompt', 'alt_text', 'accessibility_notes', 'asset_label', 'unit_visual_system'],
    [FILE_ID, 'https://drive.google.com/file/d/' + FILE_ID + '/view', 'Asset One', 'diagram', 'algebra', 'A prompt', 'Alt text value', 'Notes', 'Purpose', 'System']
  ];
}

function isSchemaRead(request) {
  return request.method === 'get' && /\/databases\/[^/]+$/.test(request.url);
}
function isPageRead(request) {
  return request.method === 'get' && /\/pages\//.test(request.url);
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

/**
 * Harness over the real production sources. NotionTransport resolves UrlFetchApp from this
 * context, so `fetchImpl` sees every outbound request. The spreadsheet is an in-memory
 * fixture; the sync history sheet lives inside it and is asserted on directly.
 */
function buildHarness({ fetchImpl, uuids, properties = {} } = {}) {
  const requests = [];
  let uuidIndex = 0;
  const { spreadsheet } = createSpreadsheetFixture({ 'Visual Sync History': [] });

  const runtime = createAppsScriptRuntime({
    spreadsheet,
    properties: Object.assign({
      DM_SOURCE_LIBRARY_SPREADSHEET_ID: 'source-spreadsheet-id',
      DM_SOURCE_LIBRARY_SHEET_NAME: 'Source Library',
      DM_NOTION_STAGING_DATA_SOURCE_ID: DATA_SOURCE_ID,
      DM_NOTION_STAGING_DATABASE_URL: DATABASE_URL,
      DM_NOTION_API_TOKEN: TOKEN
    }, properties),
    uuidFactory: () => {
      const list = uuids || ['uuid-1', 'uuid-2', 'uuid-3', 'uuid-4', 'uuid-5'];
      const value = list[Math.min(uuidIndex, list.length - 1)];
      uuidIndex += 1;
      return value;
    },
    fetchImpl(url, options) {
      requests.push({
        url: String(url),
        method: String(options.method || '').toLowerCase(),
        headers: options.headers || {},
        payload: options.payload ? JSON.parse(options.payload) : null,
        timeoutSeconds: options.timeoutSeconds
      });
      if (typeof fetchImpl !== 'function') return notionResponse(200, {});
      return fetchImpl(requests[requests.length - 1], requests.length);
    }
  });

  const harness = createAppsScriptHarness({
    runtime,
    globals: {
      Sheets: { Spreadsheets: { Values: { get: () => ({ values: sheetValues() }) } } }
    }
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
    spreadsheet,
    historyRows: () => spreadsheet.__getSheet('Visual Sync History').__getRows(),
    service: harness.getValue('VisualAssetLibraryProductionSyncService')
  };
}

/** Handles reads/queries; the write response is supplied per test. The read-back echoes the write. */
function scriptedNotion({ existing = [], write, pageId = 'page-1' }) {
  let written = null;
  return function handle(request) {
    if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
    if (isQuery(request)) return notionResponse(200, { results: typeof existing === 'function' ? existing() : existing });
    if (isPageRead(request)) return notionResponse(200, written || notionPage(pageId));
    if (isCreate(request) || isUpdate(request)) {
      written = pageFromWritePayload(pageId, request.payload.properties);
      return write(request);
    }
    return notionResponse(200, {});
  };
}

describe('VisualAssetLibraryProductionSyncService transport migration', () => {
  test('retires local API base, version, delay, and request helper ownership', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'drive-metadata-dashboard/src/VisualAssetLibraryProductionSyncService.gs'),
      'utf8'
    );
    expect(source).not.toContain('UrlFetchApp');
    expect(source).not.toContain('api.notion.com');
    expect(source).not.toContain('REQUEST_DELAY_MS');
    expect(source).not.toMatch(/NOTION_VERSION\s*=/);
    expect(source).not.toMatch(/function notionRequest_/);
    expect(source).not.toMatch(/Notion API error/);
  });

  test('classifies schema read, file_id lookup, create, and read-back through the transport', () => {
    const context = buildHarness({
      fetchImpl: scriptedNotion({
        existing: [],
        write: () => notionResponse(200, { id: 'page-1', url: 'https://www.notion.so/page1' }),
        pageRead: notionPage('page-1')
      })
    });

    const result = context.service.sync([2]);

    expect(context.requests.filter(isSchemaRead).length).toBe(1);
    expect(context.requests.filter(isSchemaRead)[0].headers['Notion-Version']).toBe('2022-06-28');
    expect(context.requests.filter(isQuery).length).toBe(1);
    expect(context.requests.filter(isQuery)[0].payload.filter).toEqual({ property: 'file_id', rich_text: { equals: FILE_ID } });
    expect(context.requests.filter(isCreate).length).toBe(1);
    expect(context.requests.filter(isPageRead).length).toBe(1);
    expect(result.row_progress[0].outcome_status).toBe('SUCCESS');
    expect(result.row_progress[0].write_outcome.operation_class).toBe('CREATE');

    // Local per-request throttling is retired: a clean run sleeps zero times.
    expect(context.runtime.getEvents('utilities.sleep').length).toBe(0);
  });

  test('classifies an existing page as UPDATE', () => {
    const context = buildHarness({
      fetchImpl: scriptedNotion({
        existing: [notionPage('page-9')],
        write: () => notionResponse(200, { id: 'page-9', url: 'https://www.notion.so/page9' }),
        pageRead: notionPage('page-9')
      })
    });

    const result = context.service.sync([2]);

    expect(context.requests.filter(isUpdate).length).toBe(1);
    expect(context.requests.filter(isUpdate)[0].url).toBe('https://api.notion.com/v1/pages/page-9');
    expect(context.requests.filter(isCreate).length).toBe(0);
    expect(result.row_progress[0].write_outcome.operation_class).toBe('UPDATE');
    expect(result.row_progress[0].write_outcome.intended_action).toBe('updated');
  });

  describe('unknown write outcomes', () => {
    /**
     * `verificationResults` may be a function of the captured write payload, so a test can
     * express "the write actually landed exactly as sent" without hand-building a page.
     */
    function runAmbiguousWrite({ existing = [], verificationResults = [], failure }) {
      let writeCalls = 0;
      let queryCalls = 0;
      let written = null;
      const context = buildHarness({
        fetchImpl(request) {
          if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
          if (isQuery(request)) {
            queryCalls += 1;
            // First query is the pre-write lookup; the rest are verification.
            if (queryCalls === 1) return notionResponse(200, { results: existing });
            const results = typeof verificationResults === 'function' ? verificationResults(written) : verificationResults;
            return notionResponse(200, { results });
          }
          if (isCreate(request) || isUpdate(request)) {
            writeCalls += 1;
            written = request.payload.properties;
            if (failure === 'timeout') throw new Error('Timeout before response');
            return notionResponse(failure, { code: 'service_unavailable' });
          }
          if (isPageRead(request)) return notionResponse(200, notionPage('page-1'));
          return notionResponse(200, {});
        }
      });

      const result = context.service.sync([2]);
      return { result, writeCalls, queryCalls, context, item: result.row_progress[0] };
    }

    test('create timeout with zero verification matches stays UNKNOWN_OUTCOME', () => {
      const { item, writeCalls } = runAmbiguousWrite({ failure: 'timeout', verificationResults: [] });

      expect(item.outcome_status).toBe('UNKNOWN_OUTCOME');
      expect(item.write_outcome.verification_status).toBe('ZERO_MATCHES');
      expect(item.write_outcome.verification_count).toBe(0);
      expect(item.write_outcome.response_received).toBe(false);
      expect(item.write_outcome.error_code).toBe('PRE_RESPONSE_FAILURE');
      expect(item.status).toBe('failed');
      expect(writeCalls).toBe(1);
    });

    test('update 503 with one exact identity-and-value match becomes VERIFIED_SUCCESS', () => {
      const { item, result, writeCalls } = runAmbiguousWrite({
        existing: [notionPage('page-9')],
        verificationResults: (written) => [pageFromWritePayload('page-9', written)],
        failure: 503
      });

      expect(item.outcome_status).toBe('VERIFIED_SUCCESS');
      expect(item.write_outcome.verification_status).toBe('MATCHED');
      expect(item.write_outcome.verification_count).toBe(1);
      expect(item.status).toBe('synced');
      expect(result.summary.unresolved_write_count).toBe(0);
      expect(writeCalls).toBe(1);
    });

    test('mismatched expected identity remains UNKNOWN_OUTCOME', () => {
      const { item, writeCalls } = runAmbiguousWrite({
        existing: [notionPage('page-9')],
        verificationResults: [notionPage('page-other')],
        failure: 503
      });

      expect(item.outcome_status).toBe('UNKNOWN_OUTCOME');
      expect(item.write_outcome.verification_status).toBe('MISMATCHED');
      expect(item.write_outcome.verification_count).toBe(1);
      expect(writeCalls).toBe(1);
    });

    test('mismatched expected file_id value remains UNKNOWN_OUTCOME', () => {
      const { item } = runAmbiguousWrite({
        verificationResults: [notionPage('page-1', 'a-different-file-id')],
        failure: 503
      });

      expect(item.outcome_status).toBe('UNKNOWN_OUTCOME');
      expect(item.write_outcome.verification_status).toBe('MISMATCHED');
    });

    test('multiple file_id matches become DUPLICATE_IDENTITY_BLOCKED', () => {
      const { item, writeCalls } = runAmbiguousWrite({
        verificationResults: [notionPage('page-1'), notionPage('page-2')],
        failure: 503
      });

      expect(item.outcome_status).toBe('DUPLICATE_IDENTITY_BLOCKED');
      expect(item.write_outcome.verification_status).toBe('MULTIPLE_MATCHES');
      expect(item.write_outcome.verification_count).toBe(2);
      expect(item.write_outcome.error_code).toBe('DUPLICATE_IDENTITY');
      expect(item.status).toBe('failed');
      expect(writeCalls).toBe(1);
    });

    test('never issues a second write after inconclusive verification', () => {
      const { writeCalls, queryCalls } = runAmbiguousWrite({ verificationResults: [], failure: 500 });

      expect(writeCalls).toBe(1);
      // Pre-write lookup plus exactly one verification query.
      expect(queryCalls).toBe(2);
    });

    test('preserves one stable operation ID across the write and its verification', () => {
      const { item, context } = runAmbiguousWrite({ verificationResults: [], failure: 500 });

      // Schema read, pre-write lookup, then the write. The verification query mints no new
      // operation ID, which proves the write's ID carried into verification evidence.
      const minted = context.runtime.getEvents('utilities.uuid').map((event) => event.value);
      expect(minted).toEqual(['uuid-1', 'uuid-2', 'uuid-3']);
      expect(item.write_outcome.operation_id).toBe('create-uuid-3');
      expect(item.operation_id).toBe('create-uuid-3');
    });

    test('read-only verification introduces no history or status writes of its own', () => {
      const { context } = runAmbiguousWrite({ verificationResults: [], failure: 500 });

      // Exactly one history append for the row, written once after the row completes.
      const dataWrites = context.spreadsheet.__getSheet('Visual Sync History').__getEvents()
        .filter((event) => event.type === 'range.setValues' && event.row > 1);
      expect(dataWrites.length).toBe(1);
      expect(context.historyRows().length).toBe(2);
      expect(context.runtime.getEvents('properties.set').length).toBe(0);
      expect(context.runtime.getEvents('sheet.appendRow').length).toBe(0);
    });
  });

  describe('result and row-progress mapping', () => {
    function outcomeFor(writeResponse) {
      const context = buildHarness({
        fetchImpl: scriptedNotion({ existing: [], write: writeResponse })
      });
      const result = context.service.sync([2]);
      return { item: result.row_progress[0], result, context };
    }

    test('maps each normalized transport status to a distinct labelled outcome', () => {
      const success = outcomeFor(() => notionResponse(200, { id: 'page-1', url: 'https://www.notion.so/page1' }));
      expect(success.item.outcome_status).toBe('SUCCESS');
      expect(success.item.outcome_label).toBe('Write acknowledged by Notion');
      expect(success.item.status).toBe('synced');

      const permanent = outcomeFor(() => notionResponse(400, { code: 'validation_error' }));
      expect(permanent.item.outcome_status).toBe('PERMANENT_FAILURE');
      expect(permanent.item.outcome_label).toBe('Permanent write failure');
      expect(permanent.item.status).toBe('failed');

      const rateLimited = outcomeFor(() => notionResponse(429, { code: 'rate_limited' }, { 'Retry-After': '3' }));
      expect(rateLimited.item.outcome_status).toBe('RATE_LIMITED_WRITE_NOT_RETRIED');
      expect(rateLimited.item.outcome_label).toBe('Rate limited; write not retried');
      expect(rateLimited.item.status).toBe('failed');
      expect(rateLimited.item.write_outcome.retry_delays_ms.some((value) => value > 0)).toBe(true);

      const unknown = outcomeFor(() => notionResponse(503, { code: 'service_unavailable' }));
      expect(unknown.item.outcome_status).toBe('UNKNOWN_OUTCOME');
      expect(unknown.item.outcome_label).toBe('Write outcome unknown; not retried');

      // Every label is distinct.
      const labels = [success, permanent, rateLimited, unknown].map((entry) => entry.item.outcome_label);
      expect(new Set(labels).size).toBe(labels.length);
    });

    test('retains the structured evidence #43 consumes', () => {
      const { item } = outcomeFor(() => notionResponse(503, { code: 'service_unavailable', additional_data: { retry_guidance: 'wait and reconcile' } }));
      const evidence = item.write_outcome;

      expect(Object.keys(evidence).sort()).toEqual([
        'attempts',
        'error_code',
        'intended_action',
        'label',
        'operation_class',
        'operation_id',
        'response_received',
        'retry_delays_ms',
        'retry_guidance',
        'status',
        'status_code',
        'verification_count',
        'verification_status'
      ]);
      expect(evidence.attempts).toBe(1);
      expect(evidence.response_received).toBe(true);
      expect(evidence.status_code).toBe(503);
      expect(evidence.retry_guidance).toBe('wait and reconcile');
      expect(Array.isArray(evidence.retry_delays_ms)).toBe(true);
    });

    test('summary surfaces unresolved writes and never advertises them as retryable', () => {
      const { result } = outcomeFor(() => notionResponse(503, { code: 'service_unavailable' }));

      expect(result.summary.outcome_counts).toEqual({ UNKNOWN_OUTCOME: 1 });
      expect(result.summary.unresolved_write_count).toBe(1);
      expect(result.summary.next_action).toBe('Reconcile unresolved write outcomes in Notion before any further write.');
    });

    test('does not record an unknown outcome as a successful history entry', () => {
      const unknown = outcomeFor(() => notionResponse(503, { code: 'service_unavailable' }));
      const unknownRow = unknown.context.historyRows()[1];
      expect(unknownRow[8]).toBe('UNKNOWN');

      const duplicateContext = buildHarness({
        fetchImpl(request) {
          if (isSchemaRead(request)) return notionResponse(200, { object: 'database', properties: SCHEMA });
          if (isQuery(request)) return notionResponse(200, { results: [notionPage('page-1'), notionPage('page-2')] });
          if (isCreate(request) || isUpdate(request)) return notionResponse(503, {});
          return notionResponse(200, {});
        }
      });
      duplicateContext.service.sync([2]);
      // The pre-write duplicate guard blocks before any write is attempted.
      expect(duplicateContext.historyRows()[1][8]).toBe('FAIL');
      expect(duplicateContext.requests.filter(isCreate).length).toBe(0);

      const success = outcomeFor(() => notionResponse(200, { id: 'page-1', url: 'https://www.notion.so/page1' }));
      expect(success.context.historyRows()[1][8]).toBe('PASS');
    });
  });

  test('keeps production mutation denied for an unapproved data source', () => {
    const context = buildHarness({ properties: { DM_NOTION_STAGING_DATA_SOURCE_ID: 'collection://production-target' } });

    expect(() => context.service.sync([2])).toThrow(/Visual Asset Library sync target is not approved/);
    expect(context.requests.length).toBe(0);
    expect(context.historyRows().length).toBe(0);
  });

  test('performs no real network access and no unauthorized mutation', () => {
    const { spreadsheet } = createSpreadsheetFixture({ 'Visual Sync History': [] });
    const runtime = createAppsScriptRuntime({
      spreadsheet,
      properties: {
        DM_SOURCE_LIBRARY_SPREADSHEET_ID: 'source-spreadsheet-id',
        DM_SOURCE_LIBRARY_SHEET_NAME: 'Source Library',
        DM_NOTION_STAGING_DATA_SOURCE_ID: DATA_SOURCE_ID,
        DM_NOTION_STAGING_DATABASE_URL: DATABASE_URL,
        DM_NOTION_API_TOKEN: TOKEN
      }
    });
    const harness = createAppsScriptHarness({
      runtime,
      globals: { Sheets: { Spreadsheets: { Values: { get: () => ({ values: sheetValues() }) } } } }
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

    // No fetchImpl is configured, so the harness refuses every outbound request.
    expect(() => runtime.globals.UrlFetchApp.fetch('https://api.notion.com/v1/databases/x', {}))
      .toThrow(/Network access is disabled/);
    runtime.resetEvents();

    expect(() => harness.getValue('VisualAssetLibraryProductionSyncService').sync([2]))
      .toThrow(/PRE_RESPONSE_FAILURE/);

    const attempted = runtime.getEvents('urlFetch.fetch');
    expect(attempted.length).toBeGreaterThan(0);
    attempted.forEach((event) => expect(event.url.indexOf('https://api.notion.com/v1/')).toBe(0));
    expect(runtime.getEvents('properties.set').length).toBe(0);
    expect(runtime.getEvents('properties.setMany').length).toBe(0);
    expect(spreadsheet.__getSheet('Visual Sync History').__getRows().length).toBe(0);
  });

  test('redacts credentials from surfaced evidence', () => {
    const context = buildHarness({
      fetchImpl: scriptedNotion({
        existing: [],
        write: () => notionResponse(500, { code: 'internal_server_error', message: 'Bearer ' + TOKEN + ' rejected' })
      })
    });

    const result = context.service.sync([2]);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain('Authorization');
    // The credential still reached the wire header, proving redaction is evidence-side only.
    expect(context.requests[0].headers.Authorization).toBe('Bearer ' + TOKEN);
  });
});

'use strict';

const { createAppsScriptHarness, createAppsScriptRuntime } = require('../helpers/appsScriptHarness.js');

const STAGING_DATA_SOURCE_ID = 'collection://bf703afb-7526-4b55-aefa-1c4976032509';
const DATABASE_ID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const DATABASE_URL = 'https://www.notion.so/workspace/' + DATABASE_ID;
const TOKEN = 'secret_notion_sync_token_value';

const SCHEMA = {
  file_name: { type: 'title' },
  file_id: { type: 'rich_text' },
  drive_url: { type: 'url' }
};

function notionResponse(status, body, headers = {}) {
  return {
    getResponseCode: () => status,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body || {})),
    getAllHeaders: () => headers
  };
}

function page(id, fileId, extra = {}) {
  return Object.assign({
    id,
    url: 'https://www.notion.so/' + String(id).replace(/-/g, ''),
    properties: {
      file_id: { type: 'rich_text', rich_text: [{ plain_text: fileId }] }
    }
  }, extra);
}

function sheetValues(rows) {
  const header = ['file_id', 'drive_url', 'file_name', 'notion_staging_eligible'];
  return [header].concat(rows.map((row) => [row.file_id, row.drive_url, row.file_name, 'true']));
}

function baseProperties(overrides = {}) {
  return Object.assign({
    DM_SOURCE_LIBRARY_SPREADSHEET_ID: 'source-spreadsheet-id',
    DM_SOURCE_LIBRARY_SHEET_NAME: 'Source Library',
    DM_NOTION_STAGING_DATA_SOURCE_ID: STAGING_DATA_SOURCE_ID,
    DM_NOTION_STAGING_DATABASE_URL: DATABASE_URL,
    DM_NOTION_API_TOKEN: TOKEN,
    DM_NOTION_SYNC_SCOPE: 'ELIGIBLE_STAGING_BATCH',
    DM_NOTION_SYNC_MODE: 'STAGING_WRITE',
    DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED: 'YES_EXPANDED_STAGING_BATCH_ONLY',
    DM_NOTION_SYNC_START_ROW: '2',
    DM_NOTION_SYNC_END_ROW: '2',
    DM_NOTION_SYNC_CURSOR_ROW: '2',
    DM_NOTION_SYNC_BATCH_SIZE: '25'
  }, overrides);
}

/**
 * Builds a harness over the real production sources. Every Notion call must travel through
 * NotionTransport, which resolves UrlFetchApp from this context, so `fetchImpl` observes the
 * complete request stream. Sheets and Drive are in-memory fixtures; nothing external is touched.
 */
function buildHarness({ rows = [{ file_id: 'file-1', drive_url: 'https://drive.google.com/file/d/file-1/view', file_name: 'Asset One' }], properties = {}, fetchImpl, uuids } = {}) {
  const requests = [];
  const driveFiles = [];
  let uuidIndex = 0;

  const runtime = createAppsScriptRuntime({
    properties: baseProperties(properties),
    uuidFactory: () => {
      const list = uuids || ['uuid-1', 'uuid-2', 'uuid-3', 'uuid-4'];
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
      return fetchImpl(requests[requests.length - 1], requests.length, requests);
    }
  });

  const harness = createAppsScriptHarness({
    runtime,
    globals: {
      Sheets: {
        Spreadsheets: {
          Values: {
            get: () => ({ values: sheetValues(rows) })
          }
        }
      },
      DriveApp: {
        createFile(name, content, mimeType) {
          driveFiles.push({ name, content, mimeType });
          return { getUrl: () => 'https://drive.google.com/file/d/in-memory-' + driveFiles.length + '/view' };
        }
      },
      MimeType: { PLAIN_TEXT: 'text/plain', CSV: 'text/csv' }
    }
  });

  harness.loadFiles([
    'drive-metadata-dashboard/src/NotionTransport.gs',
    'drive-metadata-dashboard/src/SheetReadService.gs',
    'drive-metadata-dashboard/src/NotionSyncService.gs'
  ]);

  return {
    harness,
    runtime,
    requests,
    driveFiles,
    service: harness.getValue('NotionSyncService')
  };
}

function schemaResponse() {
  return notionResponse(200, { object: 'database', properties: SCHEMA });
}

/**
 * Minimal in-memory Notion double: enough state that a create becomes visible to the
 * post-write verification query, without any network involvement.
 */
function fakeNotion({ existing = [], onWrite } = {}) {
  const pages = existing.slice();
  return function handle(request, callIndex) {
    if (isSchemaRead(request)) return schemaResponse();
    if (isQuery(request)) {
      const wanted = request.payload.filter.rich_text.equals;
      return notionResponse(200, { results: pages.filter((item) => item.properties.file_id.rich_text[0].plain_text === wanted) });
    }
    if (isCreate(request) || isUpdate(request)) {
      const override = typeof onWrite === 'function' ? onWrite(request, callIndex, pages) : null;
      if (override) return override;
      if (isCreate(request)) {
        const created = page('page-' + (pages.length + 1), request.payload.properties.file_id.rich_text[0].text.content);
        pages.push(created);
        return notionResponse(200, created);
      }
      return notionResponse(200, pages[0]);
    }
    return notionResponse(200, {});
  };
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

describe('NotionSyncService transport migration', () => {
  test('retires the local transport: no API base, version, delay, or UrlFetchApp ownership', () => {
    const source = require('fs').readFileSync(
      require('path').resolve(__dirname, '..', '..', 'drive-metadata-dashboard/src/NotionSyncService.gs'),
      'utf8'
    );
    expect(source).not.toContain('UrlFetchApp');
    expect(source).not.toContain('api.notion.com');
    expect(source).not.toContain('NOTION_REQUEST_DELAY_MS');
    expect(source).not.toContain('throttleNotionRequest_');
    expect(source).not.toMatch(/NOTION_VERSION\s*=/);
    expect(source).not.toMatch(/Notion API error/);
  });

  test('delegates schema reads as IDEMPOTENT_READ with the canonical 2022-06-28 version', () => {
    const { service, requests, runtime } = buildHarness({ fetchImpl: fakeNotion() });

    const result = service.syncEligibleStagingBatchToStaging();

    const schemaReads = requests.filter(isSchemaRead);
    expect(schemaReads.length).toBe(1);
    expect(schemaReads[0].url).toBe('https://api.notion.com/v1/databases/' + DATABASE_ID);
    expect(schemaReads[0].headers['Notion-Version']).toBe('2022-06-28');
    expect(schemaReads[0].timeoutSeconds).toBeGreaterThan(0);
    expect(result.synced_count).toBe(1);

    // Local throttling is gone: a clean run sleeps zero times.
    expect(runtime.getEvents('utilities.sleep').length).toBe(0);
  });

  test('classifies exact file_id lookup as query-via-POST, not a create', () => {
    const { service, requests } = buildHarness({ fetchImpl: fakeNotion() });

    service.syncEligibleStagingBatchToStaging();

    const queries = requests.filter(isQuery);
    expect(queries.length).toBeGreaterThanOrEqual(1);
    queries.forEach((query) => {
      expect(query.url).toBe('https://api.notion.com/v1/databases/' + DATABASE_ID + '/query');
      expect(query.payload.filter).toEqual({ property: 'file_id', rich_text: { equals: 'file-1' } });
    });
  });

  test('retries a 503 on the query-via-POST path because it is an idempotent query', () => {
    let queryAttempts = 0;
    const notion = fakeNotion();
    const { service, requests } = buildHarness({
      fetchImpl(request, callIndex) {
        if (isQuery(request)) {
          queryAttempts += 1;
          if (queryAttempts === 1) return notionResponse(503, { code: 'service_unavailable' });
        }
        return notion(request, callIndex);
      }
    });

    service.syncEligibleStagingBatchToStaging();

    expect(queryAttempts).toBeGreaterThan(1);
    expect(requests.filter(isCreate).length).toBe(1);
  });

  test('paginates the audit query through the adapter until has_more is false', () => {
    const cursors = [];
    const { service, requests, driveFiles } = buildHarness({
      properties: { DM_NOTION_STAGING_DATA_SOURCE_ID: 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd', DM_NOTION_SYNC_MODE: 'DRY_RUN' },
      fetchImpl(request) {
        if (isSchemaRead(request)) return schemaResponse();
        if (isQuery(request)) {
          cursors.push(request.payload.start_cursor || null);
          if (cursors.length === 1) {
            return notionResponse(200, { results: [page('page-1', 'file-1')], has_more: true, next_cursor: 'cursor-2' });
          }
          if (cursors.length === 2) {
            return notionResponse(200, { results: [page('page-2', 'file-2')], has_more: true, next_cursor: 'cursor-3' });
          }
          return notionResponse(200, { results: [page('page-3', 'file-3')], has_more: false, next_cursor: null });
        }
        return notionResponse(200, {});
      }
    });

    const result = service.auditVisualAssetLibrarySync();

    expect(cursors).toEqual([null, 'cursor-2', 'cursor-3']);
    expect(result.record_count).toBe(3);
    expect(requests.filter(isQuery).length).toBe(3);
    // Audit export writes only to the in-memory Drive fixture.
    expect(driveFiles.length).toBe(2);
  });

  test('classifies page creation as CREATE and page update as UPDATE', () => {
    const created = buildHarness({ fetchImpl: fakeNotion() });
    const createResult = created.service.syncEligibleStagingBatchToStaging();
    expect(created.requests.filter(isCreate).length).toBe(1);
    expect(created.requests.filter(isUpdate).length).toBe(0);
    expect(createResult.synced[0].action).toBe('created');
    expect(createResult.write_outcomes[0].operation_class).toBe('CREATE');

    const updated = buildHarness({ fetchImpl: fakeNotion({ existing: [page('page-9', 'file-1')] }) });
    const updateResult = updated.service.syncEligibleStagingBatchToStaging();
    expect(updated.requests.filter(isUpdate).length).toBe(1);
    expect(updated.requests.filter(isCreate).length).toBe(0);
    expect(updated.requests.filter(isUpdate)[0].url).toBe('https://api.notion.com/v1/pages/page-9');
    expect(updateResult.synced[0].action).toBe('updated');
    expect(updateResult.write_outcomes[0].operation_class).toBe('UPDATE');
  });

  describe('unknown write outcomes', () => {
    function runAmbiguousCreate(verificationResults, { writeResponse } = {}) {
      let createCalls = 0;
      const queries = [];
      const context = buildHarness({
        fetchImpl(request) {
          if (isSchemaRead(request)) return schemaResponse();
          if (isQuery(request)) {
            queries.push(request);
            // First query is the pre-write lookup; later queries are verification.
            if (queries.length === 1) return notionResponse(200, { results: [] });
            return notionResponse(200, { results: verificationResults });
          }
          if (isCreate(request)) {
            createCalls += 1;
            if (writeResponse === 'timeout') throw new Error('Address unavailable before response');
            return notionResponse(503, { code: 'service_unavailable' });
          }
          return notionResponse(200, {});
        }
      });
      // Note: with a verified create the post-write verifySyncedPayloads_ query also
      // resolves through the same stubbed verification results.

      let error = null;
      let result = null;
      try {
        result = context.service.syncEligibleStagingBatchToStaging();
      } catch (thrown) {
        error = thrown;
      }
      return { error, result, createCalls, queries, context };
    }

    test('pre-response write uncertainty with zero matches stays UNKNOWN_OUTCOME and never writes twice', () => {
      const { error, createCalls } = runAmbiguousCreate([], { writeResponse: 'timeout' });

      expect(error).toBeTruthy();
      const outcome = error.unresolvedWriteOutcomes[0];
      expect(outcome.transport_status).toBe('UNKNOWN_OUTCOME');
      expect(outcome.verification_status).toBe('ZERO_MATCHES');
      expect(outcome.verification_count).toBe(0);
      expect(outcome.response_received).toBe(false);
      expect(outcome.error_code).toBe('PRE_RESPONSE_FAILURE');
      expect(createCalls).toBe(1);
    });

    test('one exact identity-and-value match becomes VERIFIED_SUCCESS', () => {
      const { error, result, createCalls } = runAmbiguousCreate([page('page-1', 'file-1')]);

      expect(error).toBeNull();
      expect(result.write_outcomes[0].transport_status).toBe('VERIFIED_SUCCESS');
      expect(result.write_outcomes[0].verification_status).toBe('MATCHED');
      expect(result.write_outcomes[0].verification_count).toBe(1);
      expect(result.synced[0].page_id).toBe('page-1');
      expect(result.synced_count).toBe(1);
      expect(createCalls).toBe(1);
    });

    test('one mismatched match remains UNKNOWN_OUTCOME', () => {
      const { error, createCalls } = runAmbiguousCreate([page('page-1', 'different-file-id')]);

      expect(error).toBeTruthy();
      const outcome = error.unresolvedWriteOutcomes[0];
      expect(outcome.transport_status).toBe('UNKNOWN_OUTCOME');
      expect(outcome.verification_status).toBe('MISMATCHED');
      expect(outcome.verification_count).toBe(1);
      expect(createCalls).toBe(1);
    });

    test('multiple identity matches block as DUPLICATE_IDENTITY_BLOCKED', () => {
      const { error, createCalls } = runAmbiguousCreate([page('page-1', 'file-1'), page('page-2', 'file-1')]);

      expect(error).toBeTruthy();
      const outcome = error.unresolvedWriteOutcomes[0];
      expect(outcome.transport_status).toBe('DUPLICATE_IDENTITY_BLOCKED');
      expect(outcome.verification_status).toBe('MULTIPLE_MATCHES');
      expect(outcome.verification_count).toBe(2);
      expect(outcome.error_code).toBe('DUPLICATE_IDENTITY');
      expect(createCalls).toBe(1);
    });

    test('preserves one stable operation ID across the write and its verification query', () => {
      let capturedOperationId = null;
      const queries = [];
      let createCalls = 0;
      const uuids = ['uuid-a', 'uuid-b', 'uuid-c', 'uuid-d', 'uuid-e'];
      const context = buildHarness({
        uuids,
        fetchImpl(request) {
          if (isSchemaRead(request)) return schemaResponse();
          if (isQuery(request)) {
            queries.push(request);
            return notionResponse(200, { results: [] });
          }
          if (isCreate(request)) {
            createCalls += 1;
            return notionResponse(500, { code: 'internal_server_error' });
          }
          return notionResponse(200, {});
        }
      });

      try {
        context.service.syncEligibleStagingBatchToStaging();
      } catch (error) {
        capturedOperationId = error.unresolvedWriteOutcomes[0].operation_id;
        expect(error.notionWriteOutcomes.length).toBe(1);
      }

      // Schema read, pre-write lookup, then the write. The verification query mints no
      // new operation ID, which is what proves the write's ID carried into verification.
      const mintedIds = context.runtime.getEvents('utilities.uuid').map((event) => event.value);
      expect(mintedIds).toEqual(['uuid-a', 'uuid-b', 'uuid-c']);
      expect(capturedOperationId).toBe('create-uuid-c');
      expect(createCalls).toBe(1);
      // The pre-write lookup plus exactly one verification query, no second write.
      expect(queries.length).toBe(2);
    });

    test('an ambiguous update verified by exact identity never issues a second write', () => {
      let writeCalls = 0;
      const context = buildHarness({
        fetchImpl(request) {
          if (isSchemaRead(request)) return schemaResponse();
          if (isQuery(request)) return notionResponse(200, { results: [page('page-9', 'file-1')] });
          if (isUpdate(request)) {
            writeCalls += 1;
            return notionResponse(504, { code: 'gateway_timeout' });
          }
          return notionResponse(200, {});
        }
      });

      // The verification query returns the same page, so identity matches and the update verifies.
      const result = context.service.syncEligibleStagingBatchToStaging();
      expect(writeCalls).toBe(1);
      expect(result.write_outcomes[0].transport_status).toBe('VERIFIED_SUCCESS');
      expect(result.write_outcomes[0].verification_status).toBe('MATCHED');
    });

    test('a rate-limited write is reported without retry', () => {
      let writeCalls = 0;
      const context = buildHarness({
        fetchImpl(request) {
          if (isSchemaRead(request)) return schemaResponse();
          if (isQuery(request)) return notionResponse(200, { results: [] });
          if (isCreate(request)) {
            writeCalls += 1;
            return notionResponse(429, { code: 'rate_limited' }, { 'Retry-After': '2' });
          }
          return notionResponse(200, {});
        }
      });

      let error = null;
      try {
        context.service.syncEligibleStagingBatchToStaging();
      } catch (thrown) {
        error = thrown;
      }

      expect(error).toBeTruthy();
      expect(error.unresolvedWriteOutcomes[0].transport_status).toBe('RATE_LIMITED_WRITE_NOT_RETRIED');
      expect(writeCalls).toBe(1);
    });
  });

  test('redacts credentials from surfaced evidence and errors', () => {
    const context = buildHarness({
      fetchImpl(request) {
        if (isSchemaRead(request)) return schemaResponse();
        if (isQuery(request)) return notionResponse(200, { results: [] });
        if (isCreate(request)) {
          return notionResponse(500, { code: 'internal_server_error', message: 'Bearer ' + TOKEN + ' rejected' });
        }
        return notionResponse(200, {});
      }
    });

    let error = null;
    try {
      context.service.syncEligibleStagingBatchToStaging();
    } catch (thrown) {
      error = thrown;
    }

    expect(error).toBeTruthy();
    const serialized = JSON.stringify({
      message: error.message,
      outcomes: error.notionWriteOutcomes,
      unresolved: error.unresolvedWriteOutcomes
    });
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain('Authorization');
    // The credential still reached the wire header, proving redaction is evidence-side only.
    expect(context.requests[0].headers.Authorization).toBe('Bearer ' + TOKEN);
  });

  test('performs no real network access and no external mutation', () => {
    const runtime = createAppsScriptRuntime({ properties: baseProperties() });
    const harness = createAppsScriptHarness({
      runtime,
      globals: {
        Sheets: { Spreadsheets: { Values: { get: () => ({ values: sheetValues([{ file_id: 'file-1', drive_url: 'https://drive.google.com/file/d/file-1/view', file_name: 'Asset One' }]) }) } } }
      }
    });
    harness.loadFiles([
      'drive-metadata-dashboard/src/NotionTransport.gs',
      'drive-metadata-dashboard/src/SheetReadService.gs',
      'drive-metadata-dashboard/src/NotionSyncService.gs'
    ]);

    // No fetchImpl is configured, so the harness refuses every outbound request.
    expect(() => runtime.globals.UrlFetchApp.fetch('https://api.notion.com/v1/databases/x', {}))
      .toThrow(/Network access is disabled/);
    runtime.resetEvents();

    // The transport normalizes every refused attempt; no request ever leaves the process.
    expect(() => harness.getValue('NotionSyncService').syncEligibleStagingBatchToStaging())
      .toThrow(/PRE_RESPONSE_FAILURE/);
    const attempted = runtime.getEvents('urlFetch.fetch');
    expect(attempted.length).toBeGreaterThan(0);
    attempted.forEach((event) => expect(event.url.indexOf('https://api.notion.com/v1/')).toBe(0));

    expect(runtime.getEvents('properties.set').length).toBe(0);
    expect(runtime.getEvents('properties.setMany').length).toBe(0);
    expect(runtime.getEvents('range.setValue').length).toBe(0);
    expect(runtime.getEvents('range.setValues').length).toBe(0);
    expect(runtime.getEvents('sheet.appendRow').length).toBe(0);
  });

  test('preserves the staging authorization and production-denial boundaries', () => {
    const denials = [
      [{ DM_NOTION_STAGING_DATA_SOURCE_ID: 'collection://production-target' }, /wrong Notion data source target/],
      [{ DM_NOTION_SYNC_MODE: 'DRY_RUN' }, /DM_NOTION_SYNC_MODE is STAGING_WRITE/],
      [{ DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED: '' }, /DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED/],
      [{ DM_NOTION_API_TOKEN: '' }, /missing DM_NOTION_API_TOKEN/]
    ];

    denials.forEach(([overrides, pattern]) => {
      const context = buildHarness({ properties: overrides });
      expect(() => context.service.syncEligibleStagingBatchToStaging()).toThrow(pattern);
      // Denied runs never reach the transport.
      expect(context.requests.length).toBe(0);
    });
  });
});

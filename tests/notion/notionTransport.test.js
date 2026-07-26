'use strict';

const { createAppsScriptHarness, createAppsScriptRuntime } = require('../helpers/appsScriptHarness.js');

function response(status, body, headers = {}, useGetHeaders = false) {
  const result = {
    getResponseCode: () => status,
    getContentText: () => typeof body === 'string' ? body : JSON.stringify(body || {})
  };
  if (useGetHeaders) result.getHeaders = () => headers;
  else result.getAllHeaders = () => headers;
  return result;
}

function buildHarness() {
  const runtime = createAppsScriptRuntime();
  const harness = createAppsScriptHarness({ runtime });
  harness.loadFiles(['drive-metadata-dashboard/src/NotionTransport.gs']);
  return { harness, runtime, transport: harness.getValue('NotionTransport') };
}

function baseSpec(overrides = {}) {
  return {
    token: 'secret_test_token',
    method: 'get',
    path: '/databases/example',
    operationClass: 'IDEMPOTENT_READ',
    operationId: 'operation-1',
    timeoutSeconds: 12,
    maxElapsedMs: 60000,
    ...overrides
  };
}

describe('NotionTransport production source', () => {
  test('centralizes the 2022-06-28 version and propagates timeout without exposing credentials', () => {
    const { transport } = buildHarness();
    let captured;
    const outcome = transport.request(baseSpec(), {
      fetch(url, options) {
        captured = { url, options };
        return response(200, { object: 'database' });
      },
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(outcome.status).toBe('SUCCESS');
    expect(transport.API_VERSION).toBe('2022-06-28');
    expect(captured.options.timeoutSeconds).toBe(12);
    expect(captured.options.headers['Notion-Version']).toBe('2022-06-28');
    expect(JSON.stringify(outcome)).not.toContain('secret_test_token');
    expect(JSON.stringify(outcome)).not.toContain('Authorization');
  });

  test.each([409, 429, 500, 502, 503, 504])('retries idempotent operations for HTTP %s within bounded attempts', (status) => {
    const { transport } = buildHarness();
    let attempts = 0;
    const sleeps = [];
    const outcome = transport.request(baseSpec({ maxAttempts: 2 }), {
      fetch() {
        attempts += 1;
        return attempts === 1 ? response(status, { code: 'retryable' }) : response(200, { ok: true });
      },
      clock: () => 1000,
      jitter: () => 0,
      sleep: (ms) => sleeps.push(ms)
    });

    expect(outcome.status).toBe('SUCCESS');
    expect(attempts).toBe(2);
    expect(sleeps).toHaveLength(1);
    expect(outcome.evidence[0].retryDelayMs).toBe(sleeps[0]);
  });

  test('parses numeric and HTTP-date Retry-After values', () => {
    const { transport } = buildHarness();
    expect(transport.parseRetryAfter('2', 1000)).toBe(2000);
    expect(transport.parseRetryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 1000)).toBe(4000);
    expect(transport.parseRetryAfter('not-a-date', 1000)).toBeNull();
  });

  test('uses bounded fallback backoff for malformed Retry-After', () => {
    const { transport } = buildHarness();
    let attempts = 0;
    const sleeps = [];
    const outcome = transport.request(baseSpec({ maxAttempts: 2, baseDelayMs: 100, maxDelayMs: 150 }), {
      fetch() {
        attempts += 1;
        return attempts === 1
          ? response(429, { code: 'rate_limited' }, { 'Retry-After': 'invalid' })
          : response(200, { ok: true });
      },
      clock: () => 1000,
      jitter: () => 1,
      sleep: (ms) => sleeps.push(ms)
    });

    expect(outcome.status).toBe('SUCCESS');
    expect(sleeps[0]).toBeLessThanOrEqual(150);
    expect(outcome.evidence[0].retryDelayMs).toBe(sleeps[0]);
  });

  test('supports getHeaders response variants and case-insensitive Retry-After', () => {
    const { transport } = buildHarness();
    let attempts = 0;
    const sleeps = [];
    const outcome = transport.request(baseSpec({ maxAttempts: 2 }), {
      fetch() {
        attempts += 1;
        return attempts === 1
          ? response(429, { code: 'rate_limited' }, { 'rEtRy-AfTeR': '1' }, true)
          : response(200, { ok: true });
      },
      clock: () => 1000,
      jitter: () => 0,
      sleep: (ms) => sleeps.push(ms)
    });

    expect(outcome.status).toBe('SUCCESS');
    expect(sleeps).toEqual([1000]);
  });

  test('returns structured budget exhaustion before fetch', () => {
    const { transport } = buildHarness();
    let fetched = false;
    const outcome = transport.request(baseSpec({ deadlineMs: 2000, timeoutSeconds: 2 }), {
      fetch() { fetched = true; return response(200, {}); },
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(outcome.status).toBe('BUDGET_EXHAUSTED');
    expect(fetched).toBe(false);
  });

  test('rechecks advancing clock before retry', () => {
    const { transport } = buildHarness();
    const times = [1000, 1000, 1000, 59000, 59000];
    let index = 0;
    let attempts = 0;
    const outcome = transport.request(baseSpec({ maxAttempts: 2, maxElapsedMs: 60000 }), {
      fetch() { attempts += 1; return response(503, { code: 'service_unavailable' }); },
      clock: () => times[Math.min(index++, times.length - 1)],
      jitter: () => 0,
      sleep: () => {}
    });

    expect(outcome.status).toBe('BUDGET_EXHAUSTED');
    expect(attempts).toBe(1);
  });

  test('classifies pre-response read failures separately and retries them', () => {
    const { transport } = buildHarness();
    let attempts = 0;
    const outcome = transport.request(baseSpec({ maxAttempts: 2 }), {
      fetch() {
        attempts += 1;
        if (attempts === 1) throw new Error('network token secret_should_be_redacted');
        return response(200, { ok: true });
      },
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(outcome.status).toBe('SUCCESS');
    expect(outcome.evidence[0].code).toBe('PRE_RESPONSE_FAILURE');
    expect(JSON.stringify(outcome)).not.toContain('secret_should_be_redacted');
  });

  test('retries malformed JSON only for retryable read/query responses', () => {
    const { transport } = buildHarness();
    let attempts = 0;
    const outcome = transport.request(baseSpec({ maxAttempts: 2 }), {
      fetch() {
        attempts += 1;
        return attempts === 1 ? response(503, '{bad json') : response(200, { ok: true });
      },
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(outcome.status).toBe('SUCCESS');
    expect(attempts).toBe(2);
    expect(outcome.evidence[0].code).toBe('MALFORMED_JSON');
  });

  test('does not retry a rate-limited write', () => {
    const { transport } = buildHarness();
    let writes = 0;
    const outcome = transport.request(baseSpec({
      method: 'post',
      path: '/pages',
      operationClass: 'CREATE',
      body: { properties: {} },
      maxAttempts: 3
    }), {
      fetch() { writes += 1; return response(429, { code: 'rate_limited' }, { 'Retry-After': '2' }); },
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => { throw new Error('write retry sleep should not run'); }
    });

    expect(writes).toBe(1);
    expect(outcome.status).toBe('RATE_LIMITED_WRITE_NOT_RETRIED');
    expect(outcome.evidence[0].retryDelayMs).toBe(2000);
  });

  test('does not retry create after an ambiguous failure and preserves UNKNOWN_OUTCOME for zero matches', () => {
    const { transport } = buildHarness();
    let writes = 0;
    const outcome = transport.request(baseSpec({
      method: 'post',
      path: '/pages',
      operationClass: 'CREATE',
      body: { parent: { database_id: 'db' }, properties: {} },
      verify: () => []
    }), {
      fetch() { writes += 1; throw new Error('timeout'); },
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(writes).toBe(1);
    expect(outcome.status).toBe('UNKNOWN_OUTCOME');
    expect(outcome.verification.status).toBe('ZERO_MATCHES');
  });

  test('does not run verification without enough reserved budget', () => {
    const { transport } = buildHarness();
    let verified = false;
    const outcome = transport.request(baseSpec({
      method: 'patch',
      path: '/pages/page-1',
      operationClass: 'UPDATE',
      body: { properties: {} },
      maxElapsedMs: 50000,
      verificationBudgetMs: 50001,
      verify: () => { verified = true; return []; }
    }), {
      fetch: () => response(503, { code: 'service_unavailable' }),
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(verified).toBe(false);
    expect(outcome.status).toBe('UNKNOWN_OUTCOME');
    expect(outcome.verification.status).toBe('NOT_RUN');
  });

  test('requires verifyMatch before one result may become VERIFIED_SUCCESS', () => {
    const { transport } = buildHarness();
    const outcome = transport.request(baseSpec({
      method: 'patch',
      path: '/pages/page-1',
      operationClass: 'UPDATE',
      body: { properties: {} },
      verify: () => [{ id: 'page-1' }]
    }), {
      fetch: () => response(503, { code: 'service_unavailable' }),
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(outcome.status).toBe('UNKNOWN_OUTCOME');
    expect(outcome.verification.status).toBe('MISMATCHED');
  });

  test('returns VERIFIED_SUCCESS for one exact matching verification result', () => {
    const { transport } = buildHarness();
    const match = { id: 'page-1', properties: { file_id: 'file-1' } };
    const outcome = transport.request(baseSpec({
      method: 'patch',
      path: '/pages/page-1',
      operationClass: 'UPDATE',
      body: { properties: {} },
      verify: () => [match],
      verifyMatch: (candidate) => candidate.id === 'page-1'
    }), {
      fetch: () => response(503, { code: 'service_unavailable' }),
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(outcome.status).toBe('VERIFIED_SUCCESS');
    expect(outcome.data).toEqual(match);
  });

  test('verifyMatch throwing on an ambiguous write returns UNKNOWN_OUTCOME without retrying or leaking secrets', () => {
    const { transport } = buildHarness();
    let attempts = 0;
    let outcome;

    expect(() => {
      outcome = transport.request(baseSpec({
        method: 'patch',
        path: '/pages/page-1',
        operationClass: 'UPDATE',
        body: { properties: {} },
        verify: () => [{ id: 'page-1' }],
        verifyMatch: () => { throw new Error('lookup failed for token secret_should_be_redacted'); }
      }), {
        fetch: () => {
          attempts += 1;
          return response(503, { code: 'service_unavailable', additional_data: { retry_guidance: 'reconcile before retrying' } });
        },
        clock: () => 1000,
        jitter: () => 0,
        sleep: () => {}
      });
    }).not.toThrow();

    expect(outcome.status).toBe('UNKNOWN_OUTCOME');
    expect(outcome.verification.status).toBe('ERROR');
    expect(outcome.verification.count).toBe(1);
    expect(outcome.statusCode).toBe(503);
    expect(outcome.responseReceived).toBe(true);
    expect(outcome.retryGuidance).toBe('reconcile before retrying');
    expect(JSON.stringify(outcome)).not.toContain('secret_should_be_redacted');
    expect(attempts).toBe(1);
  });

  test('blocks duplicate identity matches after an unknown write outcome', () => {
    const { transport } = buildHarness();
    const outcome = transport.request(baseSpec({
      method: 'post',
      path: '/pages',
      operationClass: 'CREATE',
      body: { properties: {} },
      verify: () => [{ id: 'one' }, { id: 'two' }]
    }), {
      fetch: () => response(503, { code: 'service_unavailable' }),
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(outcome.status).toBe('DUPLICATE_IDENTITY_BLOCKED');
    expect(outcome.verification.count).toBe(2);
  });

  // Callers must be able to tell "no response at all" apart from "5xx received", and #43
  // consumes retry guidance from unknown outcomes. Both were dropped on this path.
  test('retains observed status code and retry guidance across every unknown-write outcome', () => {
    const { transport } = buildHarness();
    function unknownWrite(verify, verifyMatch) {
      return transport.request(baseSpec({
        method: 'post',
        path: '/pages',
        operationClass: 'CREATE',
        body: { properties: {} },
        verify,
        verifyMatch
      }), {
        fetch: () => response(503, { code: 'service_unavailable', additional_data: { retry_guidance: 'reconcile before retrying' } }),
        clock: () => 1000,
        jitter: () => 0,
        sleep: () => {}
      });
    }

    const zero = unknownWrite(() => []);
    expect(zero.status).toBe('UNKNOWN_OUTCOME');
    expect(zero.statusCode).toBe(503);
    expect(zero.responseReceived).toBe(true);
    expect(zero.retryGuidance).toBe('reconcile before retrying');

    const matched = unknownWrite(() => [{ id: 'one' }], () => true);
    expect(matched.status).toBe('VERIFIED_SUCCESS');
    expect(matched.statusCode).toBe(503);
    expect(matched.responseReceived).toBe(true);

    const duplicate = unknownWrite(() => [{ id: 'one' }, { id: 'two' }]);
    expect(duplicate.statusCode).toBe(503);
    expect(duplicate.responseReceived).toBe(true);

    const notRun = transport.request(baseSpec({
      method: 'post', path: '/pages', operationClass: 'CREATE', body: { properties: {} }
    }), {
      fetch: () => response(503, { code: 'service_unavailable' }),
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });
    expect(notRun.verification.status).toBe('NOT_RUN');
    expect(notRun.statusCode).toBe(503);
    expect(notRun.responseReceived).toBe(true);

    // A genuine pre-response failure still reports no response.
    const preResponse = transport.request(baseSpec({
      method: 'post', path: '/pages', operationClass: 'CREATE', body: { properties: {} }, verify: () => []
    }), {
      fetch: () => { throw new Error('no response'); },
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });
    expect(preResponse.status).toBe('UNKNOWN_OUTCOME');
    expect(preResponse.statusCode).toBe(0);
    expect(preResponse.responseReceived).toBe(false);
  });

  test('fails closed for unknown operation classes before fetch', () => {
    const { transport } = buildHarness();
    let fetched = false;
    const outcome = transport.request(baseSpec({ operationClass: 'something_new' }), {
      fetch() { fetched = true; return response(200, {}); },
      clock: () => 1000,
      operationIdFactory: () => 'generated-id'
    });

    expect(outcome.status).toBe('BLOCKED_INVALID_REQUEST');
    expect(outcome.errorCode).toBe('UNKNOWN_OPERATION_CLASS');
    expect(fetched).toBe(false);
  });

  test('blocks unapproved absolute hosts before fetch', () => {
    const { transport } = buildHarness();
    let fetched = false;
    const outcome = transport.request(baseSpec({ path: 'https://example.com/notion' }), {
      fetch() { fetched = true; return response(200, {}); },
      clock: () => 1000
    });

    expect(outcome.status).toBe('BLOCKED_INVALID_REQUEST');
    expect(outcome.errorCode).toBe('UNAPPROVED_ENDPOINT_HOST');
    expect(fetched).toBe(false);
  });

  test('blocks blank generated operation IDs', () => {
    const { transport } = buildHarness();
    const outcome = transport.request(baseSpec({ operationId: '' }), {
      operationIdFactory: () => '',
      clock: () => 1000,
      fetch: () => response(200, {})
    });

    expect(outcome.status).toBe('BLOCKED_INVALID_REQUEST');
    expect(outcome.errorCode).toBe('MISSING_OPERATION_ID');
  });

  test('rejects circular payloads before fetch', () => {
    const { transport } = buildHarness();
    const circular = {};
    circular.self = circular;
    let fetched = false;
    const outcome = transport.request(baseSpec({ method: 'post', operationClass: 'IDEMPOTENT_QUERY', body: circular }), {
      fetch() { fetched = true; return response(200, {}); },
      clock: () => 1000
    });

    expect(outcome.status).toBe('BLOCKED_PAYLOAD_LIMIT');
    expect(outcome.errorCode).toBe('PAYLOAD_SERIALIZATION_FAILED');
    expect(fetched).toBe(false);
  });

  test('rejects oversized payloads before fetch', () => {
    const { transport } = buildHarness();
    let fetched = false;
    const outcome = transport.request(baseSpec({
      method: 'post',
      operationClass: 'IDEMPOTENT_QUERY',
      body: { blocks: Array.from({ length: 1001 }, (_, index) => ({ index })) }
    }), {
      fetch() { fetched = true; return response(200, {}); },
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(outcome.status).toBe('BLOCKED_PAYLOAD_LIMIT');
    expect(fetched).toBe(false);
  });

  test('preserves redacted retry guidance', () => {
    const { transport } = buildHarness();
    const outcome = transport.request(baseSpec({ maxAttempts: 1 }), {
      fetch: () => response(503, {
        code: 'service_unavailable',
        additional_data: { retry_guidance: 'reduce page size; Bearer token-is-private' }
      }),
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });

    expect(outcome.retryGuidance).toContain('reduce page size');
    expect(outcome.retryGuidance).toContain('[REDACTED]');
  });

  test('requestOrThrow preserves structured outcome without secret leakage', () => {
    const { transport } = buildHarness();
    expect.assertions(4);
    try {
      transport.requestOrThrow(baseSpec({ maxAttempts: 1 }), {
        fetch: () => response(500, { code: 'internal_error', message: 'token=private-value' }),
        clock: () => 1000,
        jitter: () => 0,
        sleep: () => {}
      });
    } catch (error) {
      expect(error.name).toBe('NotionTransportError');
      expect(error.notionTransportOutcome.status).toBe('PERMANENT_FAILURE');
      expect(JSON.stringify(error.notionTransportOutcome)).not.toContain('private-value');
      expect(error.message).not.toContain('secret_test_token');
    }
  });

  // The transport does not classify operations itself: it trusts the operationClass a caller
  // supplies and treats IDEMPOTENT_QUERY as retryable like a read, while CREATE is never blindly
  // retried after an ambiguous outcome. This proves query-via-POST's classification actually
  // changes transport behavior, distinguishing it from a misclassified CREATE.
  test('a POST classified as IDEMPOTENT_QUERY retries like a read, unlike a POST classified as CREATE', () => {
    const { transport } = buildHarness();
    let queryAttempts = 0;
    const queryOutcome = transport.request(baseSpec({
      method: 'post',
      path: '/databases/example/query',
      operationClass: 'IDEMPOTENT_QUERY',
      body: { page_size: 2 },
      maxAttempts: 2
    }), {
      fetch() {
        queryAttempts += 1;
        return queryAttempts === 1 ? response(503, { code: 'service_unavailable' }) : response(200, { results: [] });
      },
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });
    expect(queryOutcome.status).toBe('SUCCESS');
    expect(queryAttempts).toBe(2);

    let createAttempts = 0;
    const createOutcome = transport.request(baseSpec({
      method: 'post',
      path: '/databases/example/query',
      operationClass: 'CREATE',
      body: { page_size: 2 },
      maxAttempts: 2
    }), {
      fetch() {
        createAttempts += 1;
        return response(503, { code: 'service_unavailable' });
      },
      clock: () => 1000,
      jitter: () => 0,
      sleep: () => {}
    });
    expect(createOutcome.status).toBe('UNKNOWN_OUTCOME');
    expect(createAttempts).toBe(1);
  });
});

// Caller-delegation coverage: proves VisualAssetLibraryWriteService.gs and
// VisualAssetLibraryValidationService.gs delegate their Notion schema read through
// NotionTransport.requestOrThrow rather than talking to Notion directly, using the real
// production source with bounded local stubs for their Apps Script dependencies.
describe('Visual Asset Library caller delegation through NotionTransport', () => {
  const NOTION_DATABASE_ID = '0123456789abcdef0123456789abcdef';
  const NOTION_TOKEN = 'test-configured-token';

  function recordingDouble(methods) {
    const calls = {};
    const impl = {};
    Object.keys(methods).forEach((name) => {
      calls[name] = [];
      impl[name] = (...args) => {
        calls[name].push(args);
        return methods[name].apply(null, args);
      };
    });
    impl.__calls = calls;
    return impl;
  }

  function createNotionTransportDouble(schemaResponse) {
    const real = buildHarness().transport;
    const calls = [];
    return {
      OPERATION: real.OPERATION,
      requestOrThrow(spec) {
        calls.push(spec);
        return schemaResponse;
      },
      __calls: calls
    };
  }

  function baseProperties(overrides = {}) {
    return {
      DM_SOURCE_LIBRARY_SPREADSHEET_ID: 'sheet-fixture-id',
      DM_SOURCE_LIBRARY_SHEET_NAME: 'Sheet1',
      DM_NOTION_STAGING_DATA_SOURCE_ID: 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd',
      DM_NOTION_STAGING_DATABASE_URL: 'https://www.notion.so/workspace/' + NOTION_DATABASE_ID,
      DM_NOTION_API_TOKEN: NOTION_TOKEN,
      DM_NOTION_SYNC_START_ROW: '2',
      DM_NOTION_SYNC_END_ROW: '3',
      DM_NOTION_SYNC_CURSOR_ROW: '2',
      DM_NOTION_SYNC_BATCH_SIZE: '25',
      DM_NOTION_SYNC_MAX_END_ROW: '454',
      DM_NOTION_SYNC_SCOPE: 'ELIGIBLE_STAGING_BATCH',
      ...overrides
    };
  }

  const fixtureRecords = [
    { rowNumber: 2, file_id: 'file-2' },
    { rowNumber: 3, file_id: 'file-3' }
  ];

  test('VisualAssetLibraryWriteService.syncEligibleBatch delegates the schema read through NotionTransport.requestOrThrow', () => {
    const properties = baseProperties({
      DM_NOTION_SYNC_MODE: 'STAGING_WRITE',
      DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED: 'YES_EXPANDED_STAGING_BATCH_ONLY',
      DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED: 'YES_VISUAL_ASSET_LIBRARY_ONLY'
    });
    const runtime = createAppsScriptRuntime({ properties });

    const notionTransport = createNotionTransportDouble({ properties: { Name: { id: 'title' } } });
    const sheetReadService = recordingDouble({
      readSpreadsheetRowsById: () => ({ warnings: [], records: fixtureRecords })
    });
    const dryRunProofService = recordingDouble({
      assertMatches: () => ({ saved_at: 'proof-saved-at' })
    });
    const productionSyncService = recordingDouble({
      sync: () => ({
        row_progress: [{
          status: 'synced',
          source_row: 2,
          file_id: 'file-2',
          notion_page_url: 'https://notion.so/page-2',
          sync_percent: 100,
          complete_fields: 5,
          total_fields: 5,
          field_results: []
        }],
        summary: { total: 1 }
      })
    });

    const harness = createAppsScriptHarness({
      runtime,
      globals: {
        NotionTransport: notionTransport,
        SheetReadService: sheetReadService,
        VisualAssetLibraryDryRunProofService: dryRunProofService,
        VisualAssetLibraryProductionSyncService: productionSyncService
      }
    });
    harness.loadFiles(['drive-metadata-dashboard/src/VisualAssetLibraryWriteService.gs']);

    const result = harness.getValue('VisualAssetLibraryWriteService').syncEligibleBatch();

    expect(notionTransport.__calls).toHaveLength(1);
    const requestSpec = notionTransport.__calls[0];
    expect(requestSpec.method).toBe('get');
    expect(requestSpec.path).toBe('/databases/' + NOTION_DATABASE_ID);
    expect(requestSpec.operationClass).toBe(notionTransport.OPERATION.IDEMPOTENT_READ);
    expect(requestSpec.token).toBe(NOTION_TOKEN);

    expect(runtime.getEvents('urlFetch.fetch')).toHaveLength(0);

    expect(productionSyncService.__calls.sync).toHaveLength(1);
    expect(productionSyncService.__calls.sync[0][0]).toEqual([2, 3]);
    expect(dryRunProofService.__calls.assertMatches).toHaveLength(1);
    expect(dryRunProofService.__calls.assertMatches[0][2]).toEqual({ Name: { id: 'title' } });

    expect(result.dry_run_proof_saved_at).toBe('proof-saved-at');
    expect(result.synced_count).toBe(1);
    expect(JSON.stringify(result)).not.toContain(NOTION_TOKEN);
  });

  test('VisualAssetLibraryValidationService.dryRunFieldValidationOnly delegates the schema read through NotionTransport.requestOrThrow', () => {
    const properties = baseProperties({ DM_NOTION_SYNC_MODE: 'DRY_RUN' });
    const runtime = createAppsScriptRuntime({ properties });

    const notionTransport = createNotionTransportDouble({ properties: { Name: { id: 'title' } } });
    const sheetReadService = recordingDouble({
      readSpreadsheetRowsById: () => ({ warnings: [], records: fixtureRecords })
    });
    const dryRunProofService = recordingDouble({
      save: () => ({ id: 'proof-1' })
    });
    const productionSyncService = recordingDouble({
      dryRun: () => ({
        row_progress: [{
          status: 'waiting',
          source_row: 2,
          file_id: 'file-2',
          notion_page_url: '',
          field_results: []
        }],
        summary: { total: 1 },
        keyword_mode: 'STRICT'
      })
    });

    const harness = createAppsScriptHarness({
      runtime,
      globals: {
        NotionTransport: notionTransport,
        SheetReadService: sheetReadService,
        VisualAssetLibraryDryRunProofService: dryRunProofService,
        VisualAssetLibraryProductionSyncService: productionSyncService
      }
    });
    harness.loadFiles(['drive-metadata-dashboard/src/VisualAssetLibraryValidationService.gs']);

    const result = harness.getValue('VisualAssetLibraryValidationService').dryRunFieldValidationOnly();

    expect(notionTransport.__calls).toHaveLength(1);
    const requestSpec = notionTransport.__calls[0];
    expect(requestSpec.method).toBe('get');
    expect(requestSpec.path).toBe('/databases/' + NOTION_DATABASE_ID);
    expect(requestSpec.operationClass).toBe(notionTransport.OPERATION.IDEMPOTENT_READ);
    expect(requestSpec.token).toBe(NOTION_TOKEN);

    expect(runtime.getEvents('urlFetch.fetch')).toHaveLength(0);

    expect(productionSyncService.__calls.dryRun).toHaveLength(1);
    expect(productionSyncService.__calls.dryRun[0][0]).toEqual([2, 3]);
    expect(dryRunProofService.__calls.save).toHaveLength(1);
    expect(dryRunProofService.__calls.save[0][1]).toEqual({ Name: { id: 'title' } });

    expect(result.dry_run_proof).toEqual({ id: 'proof-1' });
    expect(JSON.stringify(result)).not.toContain(NOTION_TOKEN);
  });
});

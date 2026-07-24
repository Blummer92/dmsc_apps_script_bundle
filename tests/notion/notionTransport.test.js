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
});

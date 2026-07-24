var NotionTransport = (function() {
  const API_BASE_URL = 'https://api.notion.com/v1';
  const DEFAULT_API_VERSION = '2022-06-28';
  const DEFAULT_TIMEOUT_SECONDS = 45;
  const DEFAULT_MAX_ATTEMPTS = 3;
  const DEFAULT_MAX_ELAPSED_MS = 120000;
  const DEFAULT_BASE_DELAY_MS = 500;
  const DEFAULT_MAX_DELAY_MS = 10000;
  const DEFAULT_RESERVE_MS = 5000;
  const MAX_PAYLOAD_BYTES = 500 * 1024;
  const MAX_BLOCK_ELEMENTS = 1000;

  const OPERATION = {
    IDEMPOTENT_READ: 'IDEMPOTENT_READ',
    IDEMPOTENT_QUERY: 'IDEMPOTENT_QUERY',
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    UNKNOWN: 'UNKNOWN'
  };

  function request(spec, dependencies) {
    spec = spec || {};
    dependencies = dependencies || {};
    const operationClass = normalizeOperationClass_(spec.operationClass);
    const method = String(spec.method || 'get').toLowerCase();
    const operationId = String(spec.operationId || createOperationId_(dependencies)).trim();
    const startedAt = now_(dependencies);
    const deadline = Number(spec.deadlineMs || (startedAt + Number(spec.maxElapsedMs || DEFAULT_MAX_ELAPSED_MS)));
    const maxAttempts = Math.max(1, Number(spec.maxAttempts || DEFAULT_MAX_ATTEMPTS));
    const timeoutSeconds = Math.max(1, Number(spec.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS));
    const reserveMs = Math.max(0, Number(spec.reserveMs || DEFAULT_RESERVE_MS));
    const endpoint = normalizeEndpoint_(spec.path || spec.endpoint || '');
    const evidence = [];

    const payloadCheck = validatePayload_(spec.body);
    if (!payloadCheck.ok) {
      return result_('BLOCKED_PAYLOAD_LIMIT', operationId, operationClass, method, endpoint, startedAt, dependencies, {
        errorCode: payloadCheck.code,
        detail: payloadCheck.detail,
        attempts: 0,
        evidence: evidence
      });
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (!hasBudget_(deadline, timeoutSeconds * 1000 + reserveMs, dependencies)) {
        return result_('BUDGET_EXHAUSTED', operationId, operationClass, method, endpoint, startedAt, dependencies, {
          attempts: attempt - 1,
          evidence: evidence,
          errorCode: 'INSUFFICIENT_EXECUTION_BUDGET'
        });
      }

      let response;
      try {
        response = fetch_(buildUrl_(endpoint), buildOptions_(spec, method, timeoutSeconds), dependencies);
      } catch (error) {
        evidence.push(attemptEvidence_(attempt, 0, false, 'PRE_RESPONSE_FAILURE', error && error.message));
        if (isWrite_(operationClass)) {
          return verifyUnknownWrite_(spec, dependencies, operationId, operationClass, method, endpoint, startedAt, deadline, attempt, evidence, 'PRE_RESPONSE_FAILURE');
        }
        if (attempt >= maxAttempts || !hasBudget_(deadline, DEFAULT_BASE_DELAY_MS + reserveMs, dependencies)) {
          return result_('RETRY_EXHAUSTED', operationId, operationClass, method, endpoint, startedAt, dependencies, {
            attempts: attempt,
            evidence: evidence,
            errorCode: 'PRE_RESPONSE_FAILURE'
          });
        }
        sleep_(computeBackoff_(attempt, null, dependencies, spec), dependencies);
        continue;
      }

      const status = Number(response.getResponseCode());
      const text = String(response.getContentText() || '');
      const headers = getHeaders_(response);
      let parsed;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch (error) {
        evidence.push(attemptEvidence_(attempt, status, true, 'MALFORMED_JSON', 'response body redacted'));
        if (isWrite_(operationClass)) {
          return verifyUnknownWrite_(spec, dependencies, operationId, operationClass, method, endpoint, startedAt, deadline, attempt, evidence, 'MALFORMED_JSON');
        }
        return result_('PERMANENT_FAILURE', operationId, operationClass, method, endpoint, startedAt, dependencies, {
          attempts: attempt,
          evidence: evidence,
          statusCode: status,
          errorCode: 'MALFORMED_JSON'
        });
      }

      if (status >= 200 && status < 300) {
        evidence.push(attemptEvidence_(attempt, status, true, 'SUCCESS', ''));
        return result_('SUCCESS', operationId, operationClass, method, endpoint, startedAt, dependencies, {
          attempts: attempt,
          statusCode: status,
          data: parsed,
          evidence: evidence
        });
      }

      const errorCode = safeErrorCode_(parsed, status);
      const retryGuidance = safeRetryGuidance_(parsed);
      evidence.push(attemptEvidence_(attempt, status, true, errorCode, retryGuidance));

      if (isWrite_(operationClass) && isUnknownWriteStatus_(status)) {
        return verifyUnknownWrite_(spec, dependencies, operationId, operationClass, method, endpoint, startedAt, deadline, attempt, evidence, errorCode);
      }

      if (!isRetryableRead_(operationClass, status) || attempt >= maxAttempts) {
        return result_('PERMANENT_FAILURE', operationId, operationClass, method, endpoint, startedAt, dependencies, {
          attempts: attempt,
          statusCode: status,
          errorCode: errorCode,
          retryGuidance: retryGuidance,
          evidence: evidence
        });
      }

      const retryAfterMs = parseRetryAfter_(headers['Retry-After'] || headers['retry-after'], now_(dependencies));
      const delayMs = computeBackoff_(attempt, retryAfterMs, dependencies, spec);
      if (!hasBudget_(deadline, delayMs + timeoutSeconds * 1000 + reserveMs, dependencies)) {
        return result_('BUDGET_EXHAUSTED', operationId, operationClass, method, endpoint, startedAt, dependencies, {
          attempts: attempt,
          statusCode: status,
          errorCode: errorCode,
          retryGuidance: retryGuidance,
          evidence: evidence
        });
      }
      sleep_(delayMs, dependencies);
    }

    return result_('RETRY_EXHAUSTED', operationId, operationClass, method, endpoint, startedAt, dependencies, {
      attempts: maxAttempts,
      evidence: evidence
    });
  }

  function requestOrThrow(spec, dependencies) {
    const outcome = request(spec, dependencies);
    if (outcome.status === 'SUCCESS' || outcome.status === 'VERIFIED_SUCCESS') return outcome.data;
    const error = new Error('Notion transport ' + outcome.status + ' [' + outcome.errorCode + ']');
    error.notionTransportOutcome = outcome;
    throw error;
  }

  function verifyUnknownWrite_(spec, dependencies, operationId, operationClass, method, endpoint, startedAt, deadline, attempts, evidence, errorCode) {
    if (typeof spec.verify !== 'function' || !hasBudget_(deadline, Number(spec.verificationReserveMs || DEFAULT_RESERVE_MS), dependencies)) {
      return result_('UNKNOWN_OUTCOME', operationId, operationClass, method, endpoint, startedAt, dependencies, {
        attempts: attempts,
        errorCode: errorCode,
        evidence: evidence,
        verification: { status: 'NOT_RUN' }
      });
    }
    let verification;
    try {
      verification = spec.verify({ operationId: operationId, deadlineMs: deadline });
    } catch (error) {
      return result_('UNKNOWN_OUTCOME', operationId, operationClass, method, endpoint, startedAt, dependencies, {
        attempts: attempts,
        errorCode: errorCode,
        evidence: evidence,
        verification: { status: 'ERROR', detail: redactText_(error && error.message) }
      });
    }
    const matches = Array.isArray(verification) ? verification : (verification && verification.matches) || [];
    if (matches.length > 1) {
      return result_('DUPLICATE_IDENTITY_BLOCKED', operationId, operationClass, method, endpoint, startedAt, dependencies, {
        attempts: attempts,
        errorCode: 'DUPLICATE_IDENTITY',
        evidence: evidence,
        verification: { status: 'MULTIPLE_MATCHES', count: matches.length }
      });
    }
    if (matches.length === 1 && (!spec.verifyMatch || spec.verifyMatch(matches[0]) === true)) {
      return result_('VERIFIED_SUCCESS', operationId, operationClass, method, endpoint, startedAt, dependencies, {
        attempts: attempts,
        errorCode: errorCode,
        data: matches[0],
        evidence: evidence,
        verification: { status: 'MATCHED', count: 1 }
      });
    }
    return result_('UNKNOWN_OUTCOME', operationId, operationClass, method, endpoint, startedAt, dependencies, {
      attempts: attempts,
      errorCode: errorCode,
      evidence: evidence,
      verification: { status: matches.length ? 'MISMATCHED' : 'ZERO_MATCHES', count: matches.length }
    });
  }

  function buildOptions_(spec, method, timeoutSeconds) {
    const options = {
      method: method,
      muteHttpExceptions: true,
      timeoutSeconds: timeoutSeconds,
      headers: {
        Authorization: 'Bearer ' + String(spec.token || ''),
        'Notion-Version': String(spec.apiVersion || DEFAULT_API_VERSION)
      }
    };
    if (spec.body !== undefined && spec.body !== null) {
      options.contentType = 'application/json';
      options.payload = JSON.stringify(spec.body);
    }
    return options;
  }

  function validatePayload_(body) {
    if (body === undefined || body === null) return { ok: true };
    const serialized = JSON.stringify(body);
    if (serialized.length > MAX_PAYLOAD_BYTES) return { ok: false, code: 'PAYLOAD_BYTES_EXCEEDED', detail: 'Payload exceeds 500 KB.' };
    const count = countElements_(body);
    if (count > MAX_BLOCK_ELEMENTS) return { ok: false, code: 'PAYLOAD_ELEMENTS_EXCEEDED', detail: 'Payload exceeds 1000 elements.' };
    return { ok: true };
  }

  function countElements_(value) {
    if (Array.isArray(value)) return value.length + value.reduce(function(total, item) { return total + countElements_(item); }, 0);
    if (value && typeof value === 'object') return Object.keys(value).reduce(function(total, key) { return total + countElements_(value[key]); }, 0);
    return 0;
  }

  function normalizeOperationClass_(value) {
    const normalized = String(value || OPERATION.UNKNOWN).toUpperCase();
    return Object.prototype.hasOwnProperty.call(OPERATION, normalized) ? OPERATION[normalized] : OPERATION.UNKNOWN;
  }

  function isWrite_(operationClass) { return operationClass === OPERATION.CREATE || operationClass === OPERATION.UPDATE; }
  function isRetryableRead_(operationClass, status) {
    return (operationClass === OPERATION.IDEMPOTENT_READ || operationClass === OPERATION.IDEMPOTENT_QUERY) && [409, 429, 500, 502, 503, 504].indexOf(status) !== -1;
  }
  function isUnknownWriteStatus_(status) { return [409, 500, 502, 503, 504].indexOf(status) !== -1; }

  function parseRetryAfter_(value, nowMs) {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric * 1000);
    const parsedDate = Date.parse(String(value));
    if (Number.isNaN(parsedDate)) return null;
    return Math.max(0, parsedDate - nowMs);
  }

  function computeBackoff_(attempt, retryAfterMs, dependencies, spec) {
    if (Number.isFinite(retryAfterMs)) return Math.min(retryAfterMs, Number(spec.maxDelayMs || DEFAULT_MAX_DELAY_MS));
    const base = Number(spec.baseDelayMs || DEFAULT_BASE_DELAY_MS);
    const maximum = Number(spec.maxDelayMs || DEFAULT_MAX_DELAY_MS);
    const jitter = Number(jitter_(dependencies));
    return Math.min(maximum, Math.max(0, Math.round(base * Math.pow(2, attempt - 1) * (0.5 + Math.max(0, Math.min(1, jitter))))));
  }

  function result_(status, operationId, operationClass, method, endpoint, startedAt, dependencies, extra) {
    const output = {
      status: status,
      operationId: operationId,
      operationClass: operationClass,
      method: method,
      endpoint: endpoint,
      elapsedMs: Math.max(0, now_(dependencies) - startedAt),
      responseReceived: Boolean(extra && extra.statusCode),
      attempts: extra && extra.attempts || 0,
      statusCode: extra && extra.statusCode || 0,
      errorCode: extra && extra.errorCode || '',
      retryGuidance: extra && extra.retryGuidance || '',
      verification: extra && extra.verification || null,
      evidence: extra && extra.evidence || []
    };
    if (extra && Object.prototype.hasOwnProperty.call(extra, 'data')) output.data = extra.data;
    if (extra && extra.detail) output.detail = extra.detail;
    return output;
  }

  function attemptEvidence_(attempt, statusCode, responseReceived, code, detail) {
    return { attempt: attempt, statusCode: statusCode || 0, responseReceived: responseReceived === true, code: String(code || ''), detail: redactText_(detail) };
  }

  function safeErrorCode_(parsed, status) { return String(parsed && (parsed.code || parsed.error) || ('HTTP_' + status)).slice(0, 120); }
  function safeRetryGuidance_(parsed) { return redactText_(parsed && parsed.additional_data && parsed.additional_data.retry_guidance || ''); }
  function redactText_(value) { return String(value || '').replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]').replace(/(?:secret_|ntn_)[A-Za-z0-9_-]+/g, '[REDACTED]').slice(0, 500); }
  function normalizeEndpoint_(path) { const value = String(path || ''); return value.indexOf(API_BASE_URL) === 0 ? value.slice(API_BASE_URL.length) : value; }
  function buildUrl_(endpoint) { return endpoint.indexOf('http') === 0 ? endpoint : API_BASE_URL + endpoint; }
  function getHeaders_(response) { return response && typeof response.getAllHeaders === 'function' ? response.getAllHeaders() || {} : {}; }
  function hasBudget_(deadline, requiredMs, dependencies) { return now_(dependencies) + Math.max(0, requiredMs) <= deadline; }
  function fetch_(url, options, dependencies) { return (dependencies.fetch || function(u, o) { return UrlFetchApp.fetch(u, o); })(url, options); }
  function sleep_(ms, dependencies) { return (dependencies.sleep || function(value) { Utilities.sleep(value); })(ms); }
  function now_(dependencies) { return Number((dependencies.clock || function() { return new Date().getTime(); })()); }
  function jitter_(dependencies) { return Number((dependencies.jitter || function() { return Math.random(); })()); }
  function createOperationId_(dependencies) { return (dependencies.operationIdFactory || function() { return Utilities.getUuid(); })(); }

  return {
    OPERATION: OPERATION,
    API_VERSION: DEFAULT_API_VERSION,
    request: request,
    requestOrThrow: requestOrThrow,
    parseRetryAfter: parseRetryAfter_,
    validatePayload: validatePayload_
  };
})();

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
    const startedAt = safeNow_(dependencies);
    const operationId = resolveOperationId_(spec, dependencies);
    const deadline = resolveDeadline_(spec, startedAt);
    const maxAttempts = positiveInteger_(spec.maxAttempts, DEFAULT_MAX_ATTEMPTS);
    const timeoutSeconds = positiveInteger_(spec.timeoutSeconds, DEFAULT_TIMEOUT_SECONDS);
    const reserveMs = nonNegativeNumber_(spec.reserveMs, DEFAULT_RESERVE_MS);
    const endpointResult = normalizeEndpoint_(spec.path || spec.endpoint || '');
    const endpoint = endpointResult.endpoint;
    const evidence = [];

    if (!operationId) {
      return result_('BLOCKED_INVALID_REQUEST', '', operationClass, method, endpoint, startedAt, dependencies, {
        errorCode: 'MISSING_OPERATION_ID',
        evidence: evidence
      });
    }
    if (operationClass === OPERATION.UNKNOWN) {
      return result_('BLOCKED_INVALID_REQUEST', operationId, operationClass, method, endpoint, startedAt, dependencies, {
        errorCode: 'UNKNOWN_OPERATION_CLASS',
        evidence: evidence
      });
    }
    if (!endpointResult.ok) {
      return result_('BLOCKED_INVALID_REQUEST', operationId, operationClass, method, endpoint, startedAt, dependencies, {
        errorCode: endpointResult.errorCode,
        evidence: evidence
      });
    }

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
        evidence.push(attemptEvidence_(attempt, 0, false, 'PRE_RESPONSE_FAILURE', error && error.message, 0));
        if (isWrite_(operationClass)) {
          return verifyUnknownWrite_(spec, dependencies, operationId, operationClass, method, endpoint, startedAt, deadline, attempt, evidence, 'PRE_RESPONSE_FAILURE', { statusCode: 0, retryGuidance: '' });
        }
        if (attempt >= maxAttempts) {
          return result_('RETRY_EXHAUSTED', operationId, operationClass, method, endpoint, startedAt, dependencies, {
            attempts: attempt,
            evidence: evidence,
            errorCode: 'PRE_RESPONSE_FAILURE'
          });
        }
        const delayMs = computeBackoff_(attempt, null, dependencies, spec);
        evidence[evidence.length - 1].retryDelayMs = delayMs;
        if (!hasBudget_(deadline, delayMs + timeoutSeconds * 1000 + reserveMs, dependencies)) {
          return result_('BUDGET_EXHAUSTED', operationId, operationClass, method, endpoint, startedAt, dependencies, {
            attempts: attempt,
            evidence: evidence,
            errorCode: 'INSUFFICIENT_EXECUTION_BUDGET'
          });
        }
        sleep_(delayMs, dependencies);
        continue;
      }

      const status = responseCode_(response);
      const text = responseText_(response);
      const headers = getHeaders_(response);
      let parsed;
      let malformed = false;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch (error) {
        parsed = {};
        malformed = true;
      }

      if (malformed) {
        evidence.push(attemptEvidence_(attempt, status, true, 'MALFORMED_JSON', 'response body redacted', 0));
        if (isWrite_(operationClass)) {
          return verifyUnknownWrite_(spec, dependencies, operationId, operationClass, method, endpoint, startedAt, deadline, attempt, evidence, 'MALFORMED_JSON', { statusCode: status, retryGuidance: '' });
        }
        if (isRetryableRead_(operationClass, status) && attempt < maxAttempts) {
          const retryAfterMs = parseRetryAfter_(headerValue_(headers, 'Retry-After'), safeNow_(dependencies));
          const delayMs = computeBackoff_(attempt, retryAfterMs, dependencies, spec);
          evidence[evidence.length - 1].retryDelayMs = delayMs;
          if (!hasBudget_(deadline, delayMs + timeoutSeconds * 1000 + reserveMs, dependencies)) {
            return result_('BUDGET_EXHAUSTED', operationId, operationClass, method, endpoint, startedAt, dependencies, {
              attempts: attempt,
              statusCode: status,
              errorCode: 'MALFORMED_JSON',
              evidence: evidence
            });
          }
          sleep_(delayMs, dependencies);
          continue;
        }
        return result_('PERMANENT_FAILURE', operationId, operationClass, method, endpoint, startedAt, dependencies, {
          attempts: attempt,
          evidence: evidence,
          statusCode: status,
          errorCode: 'MALFORMED_JSON'
        });
      }

      if (status >= 200 && status < 300) {
        evidence.push(attemptEvidence_(attempt, status, true, 'SUCCESS', '', 0));
        return result_('SUCCESS', operationId, operationClass, method, endpoint, startedAt, dependencies, {
          attempts: attempt,
          statusCode: status,
          data: parsed,
          evidence: evidence
        });
      }

      const errorCode = safeErrorCode_(parsed, status);
      const retryGuidance = safeRetryGuidance_(parsed);
      evidence.push(attemptEvidence_(attempt, status, true, errorCode, retryGuidance, 0));

      if (isWrite_(operationClass)) {
        if (status === 429) {
          const retryAfterMs = parseRetryAfter_(headerValue_(headers, 'Retry-After'), safeNow_(dependencies));
          evidence[evidence.length - 1].retryDelayMs = Number.isFinite(retryAfterMs) ? Math.min(retryAfterMs, maximumDelay_(spec)) : 0;
          return result_('RATE_LIMITED_WRITE_NOT_RETRIED', operationId, operationClass, method, endpoint, startedAt, dependencies, {
            attempts: attempt,
            statusCode: status,
            errorCode: errorCode,
            retryGuidance: retryGuidance,
            evidence: evidence
          });
        }
        if (isUnknownWriteStatus_(status)) {
          return verifyUnknownWrite_(spec, dependencies, operationId, operationClass, method, endpoint, startedAt, deadline, attempt, evidence, errorCode, { statusCode: status, retryGuidance: retryGuidance });
        }
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

      const retryAfterMs = parseRetryAfter_(headerValue_(headers, 'Retry-After'), safeNow_(dependencies));
      const delayMs = computeBackoff_(attempt, retryAfterMs, dependencies, spec);
      evidence[evidence.length - 1].retryDelayMs = delayMs;
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
    error.name = 'NotionTransportError';
    error.notionTransportOutcome = outcome;
    throw error;
  }

  // statusCode is the HTTP status observed for the ambiguous write, or 0 when no response was
  // received at all. Callers rely on this to tell "no response" apart from "503 received".
  function verifyUnknownWrite_(spec, dependencies, operationId, operationClass, method, endpoint, startedAt, deadline, attempts, evidence, errorCode, observed) {
    observed = observed || {};
    const statusCode = observed.statusCode || 0;
    const retryGuidance = observed.retryGuidance || '';
    const verificationBudgetMs = positiveInteger_(spec.verificationBudgetMs, DEFAULT_TIMEOUT_SECONDS * 1000 + DEFAULT_RESERVE_MS);
    if (typeof spec.verify !== 'function' || !hasBudget_(deadline, verificationBudgetMs, dependencies)) {
      return result_('UNKNOWN_OUTCOME', operationId, operationClass, method, endpoint, startedAt, dependencies, {
        attempts: attempts,
        statusCode: statusCode,
        retryGuidance: retryGuidance,
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
        statusCode: statusCode,
        retryGuidance: retryGuidance,
        errorCode: errorCode,
        evidence: evidence,
        verification: { status: 'ERROR', detail: redactText_(error && error.message) }
      });
    }

    const matches = Array.isArray(verification) ? verification : (verification && verification.matches) || [];
    if (matches.length > 1) {
      return result_('DUPLICATE_IDENTITY_BLOCKED', operationId, operationClass, method, endpoint, startedAt, dependencies, {
        attempts: attempts,
        statusCode: statusCode,
        retryGuidance: retryGuidance,
        errorCode: 'DUPLICATE_IDENTITY',
        evidence: evidence,
        verification: { status: 'MULTIPLE_MATCHES', count: matches.length }
      });
    }
    if (matches.length === 1 && typeof spec.verifyMatch === 'function') {
      let matched;
      try {
        matched = spec.verifyMatch(matches[0]) === true;
      } catch (error) {
        return result_('UNKNOWN_OUTCOME', operationId, operationClass, method, endpoint, startedAt, dependencies, {
          attempts: attempts,
          statusCode: statusCode,
          retryGuidance: retryGuidance,
          errorCode: errorCode,
          evidence: evidence,
          verification: { status: 'ERROR', count: matches.length, detail: redactText_(error && error.message) }
        });
      }
      if (matched) {
        return result_('VERIFIED_SUCCESS', operationId, operationClass, method, endpoint, startedAt, dependencies, {
          attempts: attempts,
          statusCode: statusCode,
          retryGuidance: retryGuidance,
          errorCode: errorCode,
          data: matches[0],
          evidence: evidence,
          verification: { status: 'MATCHED', count: 1 }
        });
      }
    }
    return result_('UNKNOWN_OUTCOME', operationId, operationClass, method, endpoint, startedAt, dependencies, {
      attempts: attempts,
      statusCode: statusCode,
      retryGuidance: retryGuidance,
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
    let serialized;
    try {
      serialized = JSON.stringify(body);
    } catch (error) {
      return { ok: false, code: 'PAYLOAD_SERIALIZATION_FAILED', detail: 'Payload could not be serialized.' };
    }
    if (serialized === undefined) return { ok: false, code: 'PAYLOAD_SERIALIZATION_FAILED', detail: 'Payload could not be serialized.' };
    if (serialized.length > MAX_PAYLOAD_BYTES) return { ok: false, code: 'PAYLOAD_BYTES_EXCEEDED', detail: 'Payload exceeds the temporary 500 KB preflight ceiling.' };
    const count = countElements_(body);
    if (count > MAX_BLOCK_ELEMENTS) return { ok: false, code: 'PAYLOAD_ELEMENTS_EXCEEDED', detail: 'Payload exceeds the temporary 1000-element preflight ceiling.' };
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
    if (Number.isFinite(retryAfterMs)) return Math.min(retryAfterMs, maximumDelay_(spec));
    const base = nonNegativeNumber_(spec.baseDelayMs, DEFAULT_BASE_DELAY_MS);
    const maximum = maximumDelay_(spec);
    const jitter = Number(jitter_(dependencies));
    const boundedJitter = Number.isFinite(jitter) ? Math.max(0, Math.min(1, jitter)) : 0;
    return Math.min(maximum, Math.max(0, Math.round(base * Math.pow(2, attempt - 1) * (0.5 + boundedJitter))));
  }

  function result_(status, operationId, operationClass, method, endpoint, startedAt, dependencies, extra) {
    extra = extra || {};
    const output = {
      status: status,
      operationId: operationId,
      operationClass: operationClass,
      method: method,
      endpoint: endpoint,
      elapsedMs: Math.max(0, safeNow_(dependencies) - startedAt),
      responseReceived: Boolean(extra.statusCode),
      attempts: extra.attempts || 0,
      statusCode: extra.statusCode || 0,
      errorCode: extra.errorCode || '',
      retryGuidance: extra.retryGuidance || '',
      verification: extra.verification || null,
      evidence: extra.evidence || []
    };
    if (Object.prototype.hasOwnProperty.call(extra, 'data')) output.data = extra.data;
    if (extra.detail) output.detail = extra.detail;
    return output;
  }

  function attemptEvidence_(attempt, statusCode, responseReceived, code, detail, retryDelayMs) {
    return {
      attempt: attempt,
      statusCode: statusCode || 0,
      responseReceived: responseReceived === true,
      code: String(code || ''),
      detail: redactText_(detail),
      retryDelayMs: Number(retryDelayMs || 0)
    };
  }

  function safeErrorCode_(parsed, status) { return redactText_(parsed && (parsed.code || parsed.error) || ('HTTP_' + status)).slice(0, 120); }
  function safeRetryGuidance_(parsed) { return redactText_(parsed && parsed.additional_data && parsed.additional_data.retry_guidance || ''); }
  function redactText_(value) {
    return String(value || '')
      .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
      .replace(/(?:secret_|ntn_)[A-Za-z0-9_-]+/g, '[REDACTED]')
      .replace(/token[-_=: ]+[A-Za-z0-9._-]+/gi, 'token=[REDACTED]')
      .slice(0, 500);
  }

  function normalizeEndpoint_(path) {
    const value = String(path || '').trim();
    if (!value) return { ok: false, endpoint: '', errorCode: 'MISSING_ENDPOINT' };
    if (/^https?:\/\//i.test(value)) {
      if (value.indexOf(API_BASE_URL + '/') !== 0 && value !== API_BASE_URL) {
        return { ok: false, endpoint: '', errorCode: 'UNAPPROVED_ENDPOINT_HOST' };
      }
      return { ok: true, endpoint: value.slice(API_BASE_URL.length) || '/' };
    }
    if (value.charAt(0) !== '/') return { ok: false, endpoint: '', errorCode: 'INVALID_ENDPOINT_PATH' };
    return { ok: true, endpoint: value };
  }

  function buildUrl_(endpoint) { return API_BASE_URL + endpoint; }
  function responseCode_(response) { return response && typeof response.getResponseCode === 'function' ? Number(response.getResponseCode()) : 0; }
  function responseText_(response) { return response && typeof response.getContentText === 'function' ? String(response.getContentText() || '') : ''; }
  function getHeaders_(response) {
    if (!response) return {};
    if (typeof response.getAllHeaders === 'function') return response.getAllHeaders() || {};
    if (typeof response.getHeaders === 'function') return response.getHeaders() || {};
    return {};
  }
  function headerValue_(headers, name) {
    const target = String(name || '').toLowerCase();
    const keys = Object.keys(headers || {});
    for (let i = 0; i < keys.length; i += 1) {
      if (String(keys[i]).toLowerCase() === target) return headers[keys[i]];
    }
    return null;
  }

  function resolveOperationId_(spec, dependencies) {
    const supplied = spec.operationId === undefined || spec.operationId === null ? '' : String(spec.operationId).trim();
    if (supplied) return supplied;
    try {
      return String(createOperationId_(dependencies) || '').trim();
    } catch (error) {
      return '';
    }
  }

  function resolveDeadline_(spec, startedAt) {
    const explicit = Number(spec.deadlineMs);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return startedAt + positiveInteger_(spec.maxElapsedMs, DEFAULT_MAX_ELAPSED_MS);
  }

  function hasBudget_(deadline, requiredMs, dependencies) {
    const current = safeNow_(dependencies);
    return Number.isFinite(deadline) && Number.isFinite(current) && current + Math.max(0, Number(requiredMs) || 0) <= deadline;
  }

  function fetch_(url, options, dependencies) { return (dependencies.fetch || function(u, o) { return UrlFetchApp.fetch(u, o); })(url, options); }
  function sleep_(ms, dependencies) { return (dependencies.sleep || function(value) { Utilities.sleep(value); })(ms); }
  function safeNow_(dependencies) {
    const value = Number((dependencies.clock || function() { return new Date().getTime(); })());
    return Number.isFinite(value) ? value : new Date().getTime();
  }
  function jitter_(dependencies) { return Number((dependencies.jitter || function() { return Math.random(); })()); }
  function createOperationId_(dependencies) { return (dependencies.operationIdFactory || function() { return Utilities.getUuid(); })(); }
  function positiveInteger_(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback; }
  function nonNegativeNumber_(value, fallback) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : fallback; }
  function maximumDelay_(spec) { return nonNegativeNumber_(spec.maxDelayMs, DEFAULT_MAX_DELAY_MS); }

  return {
    OPERATION: OPERATION,
    API_VERSION: DEFAULT_API_VERSION,
    request: request,
    requestOrThrow: requestOrThrow,
    parseRetryAfter: parseRetryAfter_,
    validatePayload: validatePayload_
  };
})();

# Notion transport contract

Issue: #39

## Compatibility boundary

The transport uses `Notion-Version: 2022-06-28` by default. This is the temporary compatibility ceiling established by #38. The data-source API migration remains #52.

## Shared adapter

`drive-metadata-dashboard/src/NotionTransport.gs` provides one transport boundary with:

- semantic operation classes (`IDEMPOTENT_READ`, `IDEMPOTENT_QUERY`, `CREATE`, `UPDATE`, `UNKNOWN`);
- injected fetch, sleep, clock, jitter, and operation-ID generation;
- explicit request timeouts and total elapsed-time budgets;
- bounded retries and bounded exponential backoff;
- numeric and HTTP-date `Retry-After` parsing;
- payload preflight;
- redacted structured evidence;
- unknown-write verification without blind write retry;
- duplicate-identity blocking.

## Normalized outcomes

- `SUCCESS`
- `VERIFIED_SUCCESS`
- `RETRY_EXHAUSTED`
- `PERMANENT_FAILURE`
- `BUDGET_EXHAUSTED`
- `BLOCKED_PAYLOAD_LIMIT`
- `BLOCKED_INVALID_REQUEST`
- `RATE_LIMITED_WRITE_NOT_RETRIED`
- `UNKNOWN_OUTCOME`
- `DUPLICATE_IDENTITY_BLOCKED`

`requestOrThrow()` is the compatibility boundary for existing callers. It returns parsed data only for `SUCCESS` and `VERIFIED_SUCCESS`. Other outcomes throw an error carrying `notionTransportOutcome` for structured handling.

## Retry policy

Reads and query-via-POST operations may retry 409, 429, 500, 502, 503, and 504 while attempts and execution budget remain.

Create and update operations are never blindly retried after pre-response failure, malformed response, 409, or 5xx uncertainty. They may run an injected verification callback. Zero or mismatched results remain `UNKNOWN_OUTCOME`; multiple results block; one exact match becomes `VERIFIED_SUCCESS`.

A create or update operation that receives HTTP 429 is not automatically retried. It returns `RATE_LIMITED_WRITE_NOT_RETRIED` immediately, with the observed status code and the bounded `Retry-After` guidance preserved as evidence for the caller to act on.

## Payload byte-size preflight (#57)

Before any fetch, the request body is serialized once with `JSON.stringify` and measured in **UTF-8 bytes**, not JavaScript string length (UTF-16 code units). The configured limit is unchanged: `MAX_PAYLOAD_BYTES = 500 * 1024` (512,000 bytes).

Byte counting uses `utf8ByteLength_`, exposed on the transport as `utf8ByteLength` for testing:

- in Google Apps Script, it uses the standards-based `Utilities.newBlob(text).getBytes().length`;
- in the offline Node test harness (no `Utilities.newBlob`), it falls back to a deterministic pure-JavaScript UTF-8 encoder with no Node-only APIs;
- both paths give identical counts for ASCII, accented Latin text, CJK and other multibyte scripts, emoji (valid surrogate pairs, 4 bytes), and lone/unpaired high or low surrogates, which are treated as a single U+FFFD replacement character (3 bytes) — the same deterministic substitution the WHATWG UTF-8 encode algorithm uses.

Boundary behavior: a serialized payload of exactly 512,000 UTF-8 bytes is **allowed**; 512,001 bytes or more is **blocked**. A blocked payload never reaches `fetch` — zero network calls occur, exactly as for any other preflight rejection.

Evidence on a `BLOCKED_PAYLOAD_LIMIT` outcome for this check is bounded and structural only: `errorCode: 'PAYLOAD_BYTES_EXCEEDED'`, `payloadBytes` (the measured UTF-8 byte count), and `payloadLimitBytes` (the configured limit, 512,000). It never contains the raw payload text, the Notion token, the Authorization header, or complete request options.

`#64` remains the sole owner of the separate payload **element-count** ceiling (`MAX_BLOCK_ELEMENTS = 1000`, counted from the unstringified body via `countElements_`). That check is unchanged by this fix and runs only after the byte check passes.

## Redaction

Structured evidence never contains the Authorization header, bearer token, raw request options, or complete response body. Retry guidance is retained after bearer-token and Notion-secret redaction.

## Current migration state

The shared adapter is consumed by:

- `VisualAssetLibraryWriteService.gs`
- `VisualAssetLibraryValidationService.gs`

The remaining large local helpers in `NotionSyncService.gs` and `VisualAssetLibraryProductionSyncService.gs` still require delegation before #39 can be considered complete. No live Notion request, credential, deployment, Drive write, Sheet write, trigger change, or production mutation was used during this implementation pass.

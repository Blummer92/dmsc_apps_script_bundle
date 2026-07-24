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
- `UNKNOWN_OUTCOME`
- `DUPLICATE_IDENTITY_BLOCKED`

`requestOrThrow()` is the compatibility boundary for existing callers. It returns parsed data only for `SUCCESS` and `VERIFIED_SUCCESS`. Other outcomes throw an error carrying `notionTransportOutcome` for structured handling.

## Retry policy

Reads and query-via-POST operations may retry 409, 429, 500, 502, 503, and 504 while attempts and execution budget remain.

Create and update operations are never blindly retried after pre-response failure, malformed response, 409, or 5xx uncertainty. They may run an injected verification callback. Zero or mismatched results remain `UNKNOWN_OUTCOME`; multiple results block; one exact match becomes `VERIFIED_SUCCESS`.

## Redaction

Structured evidence never contains the Authorization header, bearer token, raw request options, or complete response body. Retry guidance is retained after bearer-token and Notion-secret redaction.

## Current migration state

The shared adapter is consumed by:

- `VisualAssetLibraryWriteService.gs`
- `VisualAssetLibraryValidationService.gs`

The remaining large local helpers in `NotionSyncService.gs` and `VisualAssetLibraryProductionSyncService.gs` still require delegation before #39 can be considered complete. No live Notion request, credential, deployment, Drive write, Sheet write, trigger change, or production mutation was used during this implementation pass.

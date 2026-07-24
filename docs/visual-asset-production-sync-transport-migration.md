# VisualAssetLibraryProductionSyncService transport migration

Issue: #56 (child of #39)

`drive-metadata-dashboard/src/VisualAssetLibraryProductionSyncService.gs` no longer owns any
Notion transport implementation. Every request is delegated to `NotionTransport`.

## Retired local ownership

| Retired | Replacement |
| --- | --- |
| `NOTION_API_BASE_URL` | `NotionTransport` owns the single base URL and rejects unapproved hosts |
| `NOTION_VERSION` | `NotionTransport.API_VERSION` (`2022-06-28`, unchanged) |
| `REQUEST_DELAY_MS` | removed; the transport owns backoff and `Retry-After` handling |
| `notionRequest_` (direct `UrlFetchApp.fetch`, local parse, local error text) | `notionRead_`, `notionQuery_`, and a `NotionTransport.request` write path |

## Operation classifications

| Call site | Class |
| --- | --- |
| `GET /databases/{id}` schema read | `IDEMPOTENT_READ` |
| `GET /pages/{id}` post-write read-back | `IDEMPOTENT_READ` |
| `POST /databases/{id}/query` exact `file_id` lookup (paginated) | `IDEMPOTENT_QUERY` |
| `POST /pages` | `CREATE` |
| `PATCH /pages/{id}` | `UPDATE` |

## Unknown write outcomes

One stable operation ID per row spans the write and its verification query. Verification
queries the exact `file_id` and requires an exact identity-and-value match: the page's
`file_id` property must equal the expected value, and for updates the page ID must equal the
targeted page.

| Verification result | Outcome |
| --- | --- |
| zero matches | `UNKNOWN_OUTCOME` (`ZERO_MATCHES`) |
| one exact identity-and-value match | `VERIFIED_SUCCESS` (`MATCHED`) |
| one mismatched match | `UNKNOWN_OUTCOME` (`MISMATCHED`) |
| multiple matches | `DUPLICATE_IDENTITY_BLOCKED` (`MULTIPLE_MATCHES`) |

No write is reissued after an inconclusive verification. Verification is strictly read-only:
it performs one query and writes no history, row status, or script property.

Because `VERIFIED_SUCCESS` already carries a freshly read page from the verification query, no
second read-back request is issued for that outcome. `SUCCESS` still reads the page back.

## Result mapping

Row status stays in the existing `synced` / `partial` / `waiting` / `failed` vocabulary so
current consumers (`VisualAssetLibraryWriteService`, `VisualAssetLibraryValidationService`,
`VisualAssetLibraryProductionManagerService`) keep working unchanged. The normalized transport
outcome is carried alongside it on every progress item as `outcome_status`, `outcome_label`,
`operation_id`, and `write_outcome`.

| Transport status | Row status | Label |
| --- | --- | --- |
| `SUCCESS` | verification-driven (`synced` / `partial`) | Write acknowledged by Notion |
| `VERIFIED_SUCCESS` | verification-driven (`synced` / `partial`) | Write verified by exact file_id read-back |
| `UNKNOWN_OUTCOME` | `failed` | Write outcome unknown; not retried |
| `DUPLICATE_IDENTITY_BLOCKED` | `failed` | Blocked: duplicate file_id identity |
| `PERMANENT_FAILURE` | `failed` | Permanent write failure |
| `BUDGET_EXHAUSTED` | `failed` | Execution budget exhausted before completion |
| `BLOCKED_PAYLOAD_LIMIT` | `failed` | Blocked before send: payload limit exceeded |
| `RATE_LIMITED_WRITE_NOT_RETRIED` | `failed` | Rate limited; write not retried |

An unconfirmed write never reports as `synced`. `summary.outcome_counts` and
`summary.unresolved_write_count` surface unresolved writes, and `summary.next_action` directs
reconciliation rather than retry whenever any unresolved write exists.

## Structured evidence retained for #43

Each `write_outcome` carries `operation_id`, `operation_class`, `intended_action`, `status`,
`label`, `attempts`, `response_received`, `status_code`, `error_code`, `retry_guidance`,
`verification_status`, `verification_count`, and `retry_delays_ms`.

## History

`verification_result` distinguishes `PASS`, `FAIL`, `UNKNOWN` (unknown outcome), and `BLOCKED`
(duplicate identity). Unknown outcomes are never recorded as successful history entries.
History entries also carry `operation_id` and `outcome_status`.

## Required transport behavior (owned by #39)

The evidence above depends on `NotionTransport` preserving the observed HTTP status and retry
guidance across every unknown-write outcome, so that a received 503 reports `statusCode: 503`
with `responseReceived: true` while a genuine pre-response failure still reports
`statusCode: 0` with `responseReceived: false`.

That was originally missing and is fixed in the transport foundation under #39, not here. This
service owns no transport change of its own.

## Preserved boundaries

Production mutation stays denied. `validateContext_` still requires the approved Visual Asset
Library data source and complete source/target/token configuration before any transport call.
This issue does not implement the #42 authorization gateway or the #43 side-effect redesign.

## Validation

`tests/notion/visualAssetLibraryProductionSyncTransport.test.js` runs against the production
source through the offline Apps Script harness. Sheets are in-memory fixtures and outbound
network access is refused by the harness. No live Notion request, credential, deployment,
Sheet, Drive, trigger, sharing, or production mutation was used.

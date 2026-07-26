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

That was originally missing and is fixed in the transport foundation under #39 (merged in
`f4b92c2`), not here. This service owns no transport change of its own.

A write receiving HTTP 429 is never automatically retried: it returns
`RATE_LIMITED_WRITE_NOT_RETRIED` immediately, the bounded `Retry-After` guidance is preserved on
`write_outcome.retry_guidance`, and the row is reported `failed` and visible for reconciliation
rather than silently dropped.

## Metadata architecture: Google Drive is the image source of truth

Google Drive remains the authoritative location for image files. Notion stores a clean,
searchable metadata catalog and a stable reference back to Drive — it never receives the image
bytes themselves. The canonical Google Drive file ID (`file_id`) is the stable identity used for
deduplication and reconciliation: every create/update is preceded by an exact `file_id` lookup,
and a changed Drive revision or metadata value updates the existing matched page rather than
creating a duplicate.

Fields currently mapped into Notion, where the existing `PropertyAliasService` contract already
defines the canonical alias: `file_id` (Drive identity), `drive_link` (stable Drive URL, falling
back to a canonical `drive.google.com/file/d/<id>/view` link when the source sheet has none),
`asset_title` (file name), `alt_text`, `accessibility_notes`, `ai_prompt`, `prompt_source` /
`prompt_source_text`, `instructional_purpose`, `style_family`, `asset_type`, `keywords`,
`version`, and `approved_use`.

Fields such as MIME type, file size, approval notes, sync status, and a last-synced timestamp
have no canonical alias in `PropertyAliasService` today and are intentionally not invented here;
adding them is a mapping-contract decision for a future focused issue, not a transport-migration
change.

This service never uploads image bytes, creates a Notion file upload, sets a page cover, or
modifies Drive sharing — confirmed by both a static source check and integration tests. Issue
#66 records this decision and is closed as not planned for binary image uploads.

## HTTP 529 (`service_overload`) — deferred to #65

Notion documents HTTP 529 as a temporary overload response. The shared transport has no explicit
529 policy today, and this caller-migration PR intentionally adds none: no caller-local 529
branching, retry, sleep, or error policy exists in this file. Shared 529 handling is owned by
#65 and belongs in `NotionTransport.gs`, not here.

## Preserved boundaries

Production mutation stays denied. `validateContext_` still requires the approved Visual Asset
Library data source and complete source/target/token configuration before any transport call.
This issue does not implement the #42 authorization gateway or the #43 side-effect redesign.
UTF-8 payload byte accounting remains #57, payload element-limit semantics remain #64, the final
aggregate validation matrix remains #58, and the 2026 Notion API migration remains #52.

## Validation

`tests/notion/visualAssetLibraryProductionSyncTransport.test.js` runs against the production
source through the offline Apps Script harness. Sheets are in-memory fixtures and outbound
network access is refused by the harness. Coverage includes operation classification (schema
read and page read as `IDEMPOTENT_READ`, exact `file_id` lookup as `IDEMPOTENT_QUERY` — proven
by a transient-failure retry, since only read/query classes retry — create as `CREATE`, update as
`UPDATE`), the full unknown-write matrix, a 429 write proven non-retried with retry guidance
preserved, stable operation ID propagation, absence of a second write after inconclusive
verification, credential redaction, and the absence of any image-upload or Drive-sharing
behavior. No live Notion request, credential, deployment, Sheet, Drive, trigger, sharing, or
production mutation was used.

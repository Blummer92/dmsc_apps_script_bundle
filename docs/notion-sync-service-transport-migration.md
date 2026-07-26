# NotionSyncService transport migration

Issue: #55 (child of #39)

`drive-metadata-dashboard/src/NotionSyncService.gs` no longer owns any Notion transport
implementation. Every request is delegated to `NotionTransport`.

## Retired local ownership

| Retired | Replacement |
| --- | --- |
| `NOTION_API_BASE_URL` | `NotionTransport` owns the single base URL and rejects unapproved hosts |
| `NOTION_VERSION` | `NotionTransport.API_VERSION` (`2022-06-28`, unchanged) |
| `NOTION_REQUEST_DELAY_MS` / `throttleNotionRequest_` | removed; the transport owns backoff and `Retry-After` handling |
| `notionRequest_` (direct `UrlFetchApp.fetch`, local parse, local error text) | `notionRead_`, `notionQuery_`, `writeNotionPage_` |

The old failure path raised `Notion API error <status>: <raw body>`, which could echo a
response body back into logs. Errors now come from the transport with redacted evidence.

## Operation classifications

| Call site | Class |
| --- | --- |
| `GET /databases/{id}` schema read (sync, audit, dry-run validation) | `IDEMPOTENT_READ` |
| `POST /databases/{id}/query` exact `file_id` lookup | `IDEMPOTENT_QUERY` |
| `POST /databases/{id}/query` paginated audit export | `IDEMPOTENT_QUERY` |
| `POST /databases/{id}/query` post-write verification read | `IDEMPOTENT_QUERY` |
| `POST /pages` | `CREATE` |
| `PATCH /pages/{id}` | `UPDATE` |

Query-via-POST is classified as an idempotent query, never as a create.

## Unknown write outcomes

`writeNotionPage_` generates one stable operation ID per row and passes it to both the write
and its verification query, so a single ID spans the whole attempt.

Verification queries the exact `file_id` and requires an exact identity-and-value match: the
page's `file_id` property must equal the expected value, and for updates the page ID must equal
the page that was targeted.

| Verification result | Outcome |
| --- | --- |
| zero matches | `UNKNOWN_OUTCOME` (`ZERO_MATCHES`) |
| one exact identity-and-value match | `VERIFIED_SUCCESS` (`MATCHED`) |
| one mismatched match | `UNKNOWN_OUTCOME` (`MISMATCHED`) |
| multiple matches | `DUPLICATE_IDENTITY_BLOCKED` (`MULTIPLE_MATCHES`) |

No write is ever reissued after an inconclusive verification. `syncPayloadsToStaging_` fails
closed: any unresolved outcome throws with `notionWriteOutcomes` and `unresolvedWriteOutcomes`
attached, and no row is reported as synced.

## Structured evidence

Successful runs surface `write_outcomes` on the returned result. Each entry carries
`operation_id`, `operation_class`, `transport_status`, `attempts`, `response_received`,
`status_code`, `error_code`, `retry_guidance`, `verification_status`, `verification_count`,
and `retry_delays_ms`.

A write receiving HTTP 429 is never automatically retried: it returns
`RATE_LIMITED_WRITE_NOT_RETRIED` immediately, and the bounded `Retry-After` guidance is
preserved on `write_outcome.retry_guidance` rather than being silently dropped.

## HTTP 529 (`service_overload`) — deferred to #65

Notion documents HTTP 529 as a temporary overload response. The shared transport has no
explicit 529 policy today, and this service intentionally adds none: no caller-local 529
branching, retry, sleep, or error policy exists in this file. Shared 529 handling is owned by
#65 and belongs in `NotionTransport.gs`, not here.

## Preserved boundaries

Staging authorization is unchanged: data-source allow-listing, `DM_NOTION_SYNC_MODE`,
`DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED`, `DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED`, and the
token requirement all still gate writes before any transport call is made. A denied run issues
zero Notion requests.

## Metadata and Drive boundaries

Google Drive remains the source of truth for image files; this service writes only metadata and
a stable Drive reference (`drive_url`, falling back to a canonical URL built from `file_id`) to
Notion. It never uploads image bytes, calls a Notion file-upload endpoint, creates an image
block or page cover, or alters Drive sharing. The Visual Asset Library `Thumbnail` property is
deliberately left unset pending a separate thumbnail technical strategy. No new Notion property
alias is invented here.

`DriveApp.createFile` is used only by the pre-existing, unrelated local audit-export feature
(`auditVisualAssetLibrarySync`), which writes JSON/CSV report files to Drive for operator review.
That call was not introduced or modified by this migration and performs no Notion write of its
own.

## Out of scope

Notion 2026 data-source migration (#52), Visual Asset write-gateway authorization (#42),
preview/live/staging side-effect separation (#43), UTF-8 payload byte accounting (#57), payload
element-limit semantics (#64), HTTP 529 shared transport handling (#65), and the observed
final-SHA validation matrix (#58).

## Validation

`tests/notion/notionSyncServiceTransport.test.js` runs against the production source through
the offline Apps Script harness. Sheets and Drive are in-memory fixtures and outbound network
access is refused by the harness. Coverage includes operation classification (schema read as
`IDEMPOTENT_READ`; exact `file_id` lookup, paginated audit query, and post-write verification all
as `IDEMPOTENT_QUERY` — proven by a transient-failure retry; create as `CREATE`; update as
`UPDATE`), the full unknown-write matrix, a 429 write proven non-retried with retry guidance
preserved, stable operation ID propagation, absence of a second write after inconclusive
verification, every staging authorization gate (including the Visual Asset Library-specific
write approval), credential redaction, and the absence of any HTTP 529 handling or
image-upload/Drive-sharing behavior. No live Notion request, credential, deployment, Sheet,
Drive, trigger, sharing, or production mutation was used.

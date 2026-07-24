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

## Preserved boundaries

Staging authorization is unchanged: data-source allow-listing, `DM_NOTION_SYNC_MODE`,
`DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED`, `DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED`, and the
token requirement all still gate writes before any transport call is made.

## Out of scope

Notion 2026 data-source migration (#52), Visual Asset write-gateway authorization (#42),
preview/live/staging side-effect separation (#43), and UTF-8 payload accounting (#57).

## Validation

`tests/notion/notionSyncServiceTransport.test.js` runs against the production source through
the offline Apps Script harness. Sheets and Drive are in-memory fixtures and outbound network
access is refused by the harness. No live Notion request, credential, deployment, Sheet, Drive,
trigger, sharing, or production mutation was used.

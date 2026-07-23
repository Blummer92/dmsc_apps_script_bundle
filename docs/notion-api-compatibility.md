# Notion API compatibility inventory

Issue: #38

## Decision

Remain temporarily on `Notion-Version: 2022-06-28` while all Notion HTTP traffic is moved behind the reusable transport planned in #39. This is a compatibility ceiling, not the long-term target.

The initial adapter must accept canonical database IDs for legacy schema/query operations and page IDs for updates. Values prefixed with `collection://` are configuration aliases, not request-ready identifiers. Databases with zero or multiple data sources are blocked for manual review until a focused migration adopts the newer data-source endpoints.

## Request helper inventory

| Source | Local helper | Operations | Identifier assumptions | Extra side effects |
|---|---|---|---|---|
| `drive-metadata-dashboard/src/NotionSyncService.gs` | `notionRequest_` | schema GET, database query, page create/update, verification | collection alias converted to database ID; page ID for update | audit export creates Drive JSON/CSV; some dry-run validation performs live reads |
| `drive-metadata-dashboard/src/VisualAssetLibraryWriteService.gs` | `notionRequest_` | schema read, file-ID lookup, create, update, verification | database ID and page ID | caller-controlled history/status writes |
| `drive-metadata-dashboard/src/VisualAssetLibraryValidationService.gs` | `notionRequest_` | schema/query validation and verification | database ID | callers may persist evidence outside transport |
| `drive-metadata-dashboard/src/VisualAssetLibraryProductionSyncService.gs` | `notionRequest_` | production-oriented schema/query/create/update | database ID and page ID | production path remains denied |

These helpers duplicate authorization headers, version selection, parsing, throttling, and outcome handling. #39 must replace them with one injectable adapter or temporary wrappers that delegate only to that adapter.

## Operation classifications

| Operation | HTTP | Classification | Retry rule |
|---|---|---|---|
| Retrieve schema | GET `/databases/{id}` | idempotent read | bounded retry for retryable failures |
| Query database | POST `/databases/{id}/query` | idempotent query-via-POST | retry by semantic class, not method |
| Find by `file_id` | POST query | idempotent query | duplicate matches block; never select first |
| Create page | POST `/pages` | create | no blind retry after unknown outcome |
| Update page | PATCH `/pages/{id}` | update | read back before deciding after unknown outcome |
| Verify page | query/read | idempotent read | bounded retry allowed |

## Identifier and multi-source policy

1. Never send `collection://...` directly to Notion.
2. Legacy operations use one validated database ID.
3. Updates use one validated page ID.
4. Empty/malformed identifiers, zero data sources, and multiple data sources return blocked/manual-review.
5. Duplicate `file_id` matches are not a valid target.
6. #42 owns approval, target registry, mode, batch bounds, and locking. #39 owns transport and normalized outcomes.

## Fixture contract

`tests/fixtures/notion-api/compatibility-cases.json` contains representative legacy schema/query responses, newer data-source responses, pagination, multi-source ambiguity, malformed payloads, rate limiting, server errors, and ambiguous write outcomes. Fixtures contain placeholders only.

## Migration boundary for #39

Initially support:

- `GET /v1/databases/{database_id}`;
- `POST /v1/databases/{database_id}/query` as a read operation;
- `POST /v1/pages` as create;
- `PATCH /v1/pages/{page_id}` as update;
- normalized success, retryable-read failure, permanent failure, duplicate-identity block, and unknown-write outcome.

The adapter must retire all four local helpers, inject fetch/sleep/clock/jitter, redact credentials and sensitive payloads, cap attempts and elapsed time, and parse numeric and HTTP-date `Retry-After` values.

## Later migration

A later focused issue may move to the newer data-source API after fixtures prove discovery, parent/query shape changes, pagination, and multi-source selection. No production header or endpoint changes belong in #38.

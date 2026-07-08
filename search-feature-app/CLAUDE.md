# search-feature-app

Read-only search sidebar across a Google Sheets metadata index and optional Drive folders. Never writes, merges, or resolves anything — duplicate detection groups results for human/agent review only (`automaticMergeEnabled: false` is always in the response).

## File map

- `src/Config.gs` — `APP_CONFIG` (script property keys, field names) and `getRuntimeConfig()`, which reads/parses all script properties (result limit, Drive folder IDs, readiness vocabulary JSON) into one config object passed down to every service call.
- `src/SearchService.gs` (`CurriculumSearchService`) — orchestrates: runs `SheetSearchService` and (if enabled) `DriveSearchService`, merges results, scores/ranks/limits them, builds duplicate-candidate groups, and assembles the final response envelope (including the governance fields below).
- `src/SheetSearchService.gs` — reads the configured index sheet in one batch read, normalizes headers, filters/matches rows.
- `src/DriveSearchService.gs` — walks configured Drive folders (bounded by `maxDriveFilesPerFolder`), matching file name/description only — never parses document bodies.
- `src/Code.gs` — `onOpen`/sidebar entrypoints; `searchCurriculum(query, filters)` is the one function the client HTML actually calls.

## Governance fields (don't drop these when touching result-building code)

Every result carries both snake_case and camelCase duplicates of the same governance fields (`canonical_owner_database`/`canonicalOwnerDatabase`, `canonical_record_url`/`canonicalRecordUrl`, `duplicate_resolution_status`/`duplicateResolutionStatus`, `approved_readiness_vocabulary`/`approvedReadinessVocabulary`) — this is intentional for UI compatibility, not accidental duplication to clean up. If you add a new governance field, add both cases.

Duplicate grouping key priority (see `getDuplicateCandidateKey_` in `SearchService.gs`): `canonical_record_url` first, then `file_url`, then a composite of normalized title + unit + lesson + packet + source document. Don't reorder this without checking `metadata/schema-map.json`'s duplicate-handling section, since the README documents this exact order as the approved behavior.

## Known duplication to watch

**Source-label normalization is implemented twice** with identical logic: `normalizeSourceLabelForResult_` in `SearchService.gs` and `normalizeSourceLabel_` in `SheetSearchService.gs` both map substrings (`notion`, `dashboard`, `drive`, `sheet`/`spreadsheet`) to the same four label strings. `SheetSearchService.recordToResult_` already normalizes the label before `SearchService.normalizeResultMetadata_` normalizes it *again* on every result — the second pass is a redundant no-op today, but if you change the mapping in one function without the other, sheet-sourced and drive-sourced results will silently disagree on labeling. If you need to change source-label rules, change both, or better, delete one and have `SheetSearchService` just pass the raw `source_system` through for `SearchService` to normalize once.

## Handoff protocol

`metadata/handoff.json` currently has `blocked_until_review: true` — per its own `pending_decisions` list, several ownership questions (canonical owner database per field, approved duplicate-resolution-status vocabulary, whether `canonical_record_url` should be required for duplicate grouping) are still open. Don't treat the schema in `metadata/schema-map.json` as final/approved without checking whether `handoff.json`'s `blocked_until_review` has flipped to `false`.

## Tests

None exist for this project (unlike `drive-metadata-dashboard`). The README's "Testing Notes" section is a manual checklist, not automated coverage. If you add non-trivial ranking/filtering/dedup logic, consider mocking `SpreadsheetApp`/`DriveApp`/`PropertiesService` and running the `.gs` source through Node's `vm` module rather than relying on manual testing alone.

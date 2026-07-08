# drive-metadata-dashboard

Read-only Drive image metadata review console, plus a guarded Notion staging-sync feature for the Visual Asset Library. This is the most complex project in the repo — two sync subsystems exist side by side (see below), and knowing which one you're editing matters.

## Two cores, not one

**Dashboard core** (always read-only): `Code.gs` → `DashboardService.buildDashboard()` → `SheetReadService` (reads rows) + `WorkspaceService` (detects active tab) + `GovernanceService` (tier/duplicate/eligibility enrichment) + `HandoffService` (handoff preview text). Nothing in this path writes anywhere. If you're touching the Scan/Review/Validation/Source Summary/Handoff Preview views, you're in this core.

**Notion sync core** — two parallel implementations, not one:
- **Legacy/generic lane**: `NotionDryRun.gs` (entrypoints like `syncNotionRows2To11ToStaging`, `syncNotionEligibleStagingBatchToStaging`) delegates into `NotionSyncService.gs`, a single ~1060-line file owning Notion property mapping and the actual `UrlFetchApp` calls.
- **Visual Asset Library lane**: `NotionDryRun.gs` routes to this lane via `isVisualAssetLibraryTarget_`, which checks `DM_NOTION_STAGING_DATA_SOURCE_ID`. From there: `VisualAssetLibraryValidationService` (dry run) and `VisualAssetLibraryWriteService` (write) both call into `VisualAssetLibraryProductionSyncService` (Notion HTTP + upsert + post-write verify), which uses `PropertyAliasService` (schema alias resolution), `AssetTypeMappingService` + `KeywordStrategyService` (controlled-vocabulary mapping), and `VisualAssetLibraryPromptMetadataService` (prompt/alt-text/keyword derivation).

**Which sync lane is "current" for the UI is ambiguous from the code alone** — `VisualAssetLibrarySyncManagerService.gs` and `VisualAssetLibraryProductionManagerService.gs` are two near-duplicate batch-manager wrappers (same status columns/colors/labels, same `run`/`getDashboard` shape) that diverge subtly: `ProductionManagerService.run` auto-advances the cursor after a clean sync; `SyncManagerService` does not. Both are wired to separate globals (`getVisualAssetLibrarySyncManager`/`runVisualAssetLibrarySyncManager` vs. `getVisualAssetLibraryProductionManager`/`runVisualAssetLibraryProductionManager`). **Before editing either, check which one the client HTML actually calls** — don't assume, and don't "fix" one without checking whether the same bug exists in the other.

## The dry-run-proof safety gate (Visual Asset Library writes)

Unlike the legacy lane's guardrails, the Visual Asset Library lane requires cryptographic-ish proof that a dry run actually happened and matches the write attempt:

1. A dry run (`VisualAssetLibraryValidationService.dryRunFieldValidationOnly`) computes expected values, diffs against live Notion, and saves a **dry-run proof** via `VisualAssetLibraryDryRunProofService.save()` — a script property containing a schema checksum, batch bounds, cursor row, and pass/fail state.
2. A write attempt (`VisualAssetLibraryWriteService.syncEligibleBatch`) calls `VisualAssetLibraryDryRunProofService.assertMatches()`, which throws `Blocked:` if *anything* differs from the saved proof (spreadsheet/sheet/data-source/sync-scope/cursor/batch bounds/batch size/schema checksum) or if the dry run had required-field failures.
3. Only then does it call `VisualAssetLibraryProductionSyncService.sync(rows)` for the actual Notion write.
4. Duplicate Notion pages for the same `file_id` cause a hard throw (`throwDuplicatePages_`), never a silent pick-one.
5. Every write is re-verified post-write (`verifyExpectedAgainstPage_`); a row is only `synced` on 100% field match, else `partial`.
6. Cursor advancement (`advanceCursorAfterPassedDryRun`) re-validates the proof against the *current* cursor before moving it — a stale or failed dry run cannot silently authorize the next batch.

**If you add a new write path in this lane, it must go through the dry-run-proof gate** — don't call `VisualAssetLibraryProductionSyncService.sync` directly from a new entrypoint without first proving a matching dry run happened.

## Script properties that are load-bearing for safety

- `DM_NOTION_SYNC_MODE` — must be `STAGING_WRITE` for any write; reset to `DRY_RUN` in `finally` blocks by the entrypoints.
- `DM_NOTION_STAGING_WRITE_APPROVED` / `DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED` / `DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED` — exact-string approval gates per lane (`YES_10_ROWS_ONLY`, `YES_EXPANDED_STAGING_BATCH_ONLY`, `YES_VISUAL_ASSET_LIBRARY_ONLY`).
- `DM_NOTION_STAGING_DATA_SOURCE_ID` — the *sole* switch that routes between the legacy and Visual Asset Library code paths (`isVisualAssetLibraryTarget_`).
- `DM_NOTION_SYNC_SCOPE`, `_START_ROW`/`_END_ROW`, `_CURSOR_ROW`, `_BATCH_SIZE`, `_MAX_END_ROW` (default 454) — bound which rows can be touched.
- `DM_VISUAL_ASSET_LIBRARY_ALLOW_GUESSED_PROMPTS` — without it, AI-guessed prompts are excluded from Alt text/AI Prompt.
- `DM_VISUAL_SYNC_PAUSED` — manual kill switch checked by both manager services before any write action.

## Known duplication to keep in sync (or better, consolidate)

- Notion HTTP/property helpers (`notionRequest_`, `getDatabaseId_`/`normalizeNotionId_`, `formatNotionProperty_`/`extractPropertyValue_`) and controlled-vocabulary tables (`CONTROLLED_OPTIONS`/`CONTROLLED_ALIASES`) are copy-pasted near-verbatim across `NotionSyncService.gs`, `VisualAssetLibraryValidationService.gs`, `VisualAssetLibraryWriteService.gs`, `VisualAssetLibraryProductionSyncService.gs`, and `VisualAssetLibraryPromptMetadataService.gs`.
- **Asset Type mapping is implemented three separate times**: `AssetTypeMappingService.map()`, `normalizeControlledValue_` inside `VisualAssetLibraryPromptMetadataService.build`, and again inside `NotionSyncService.buildVisualAssetLibraryPropertyPlan_` — each with its own alias list. If you add a new Asset Type alias, you likely need to add it in all three places, or better, consolidate them the next time you touch this area.
- Two sheet-reading entrypoints exist: `SheetReadService.readRecords`/`readActiveSpreadsheetRecords` (active-spreadsheet via `SpreadsheetApp`) vs. `readSpreadsheetRowsById` (advanced `Sheets` API service, throws `Blocked:` if that service isn't enabled). Most Notion sync code uses the latter — don't assume the former is equivalent.

## Tests

`VisualAssetLibraryProductionSyncTest.gs` has 8 plain-function tests aggregated by `testVisualAssetLibraryProductionSyncTestSuite()`. **There is no automated runner** — `scripts/codespaces-clasp-preflight-push.mjs` only checks the test file/function names are present and tracked before push; it never executes them. Run them manually in the Apps Script editor (or `clasp run testVisualAssetLibraryProductionSyncTestSuite`) after any change to the Visual Asset Library lane — nothing else will catch a regression.

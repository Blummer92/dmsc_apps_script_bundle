# Visual Asset Library production-sync and test-path audit

Issue: #28

## Executive finding

The Visual Asset Library implementation contains multiple independently callable write paths with materially different guard strength. The strongest guard path is `VisualAssetLibraryWriteService.syncEligibleBatch()`, but several public or globally exposed functions can bypass that path and write directly.

Until the bypasses and side effects below are fixed, production and live validation remain blocked.

## Public entry-point matrix

| Entry point | Primary effect | Guard strength | Side effects | Classification |
| --- | --- | --- | --- | --- |
| `runVisualAssetLibrarySyncManager(action, scope)` | dry-run validation, staging sync, verification, Sheet progress writes, Script Property updates | moderate; uses lock and resets mode, but mutates Sheets even for dry-run/verify | status cells, formatting, Script Properties, possible Notion writes | live mutation-bearing |
| `runVisualAssetLibraryProductionManager(action, scope)` | direct production-sync service calls plus Sheet progress writes | weak; no script lock and no explicit write-approval checks in manager | Sheet status/formatting, Script Properties, Notion writes, history | live mutation-bearing; blocked |
| `VisualAssetLibraryProductionSyncService.sync(rows)` | create/update Notion pages and append history | weak-to-moderate; checks target ID and required config, but not staging mode or approval properties | Notion create/update, read-back, history rows | direct write path; blocked |
| `VisualAssetLibraryProductionSyncService.dryRun(rows)` | queries Notion and compares expected fields | weak; still requires token and approved target | appends history for every row | not read-only; mutation-bearing |
| `VisualAssetLibraryProductionSyncService.verify(rows)` | queries Notion and verifies values | weak; still requires token and approved target | appends history for every row | not read-only; mutation-bearing |
| `upsertVisualAssetPage(rowMetadata)` | directly creates or updates one Notion page | weak; exported globally and bypasses `VisualAssetLibraryWriteService` approval/dry-run proof | Notion write and read-back | critical bypass; blocked |
| `findNotionPagesByFileId(fileId)` | queries Notion by file ID | target/config check only | external read, no local write in function | live read-only external call |
| `VisualAssetLibraryWriteService.syncEligibleBatch()` | guarded batch staging write | strongest current guard path | Notion writes, history through production service, logs | staging mutation-bearing |
| pause/resume/next/previous manager actions | change manager state | minimal | Script Property writes | configuration mutation |

## Critical bypass findings

### 1. Global upsert bypasses the guarded write service

`upsertVisualAssetPage()` is exported as a global function and calls `VisualAssetLibraryProductionSyncService.upsertVisualAssetPage()`. That service validates the target data-source ID and required configuration but does not require:

- `DM_NOTION_SYNC_MODE=STAGING_WRITE`;
- `DM_NOTION_SYNC_SCOPE=ELIGIBLE_STAGING_BATCH`;
- expanded staging approval;
- Visual Asset Library write approval;
- a matching saved dry-run proof;
- batch bounds.

This path can create or update a Notion page directly and must not remain publicly callable without the same authorization contract as the guarded write service.

### 2. Production manager bypasses stronger approval guards

`runVisualAssetLibraryProductionManager('SYNC', scope)` calls `VisualAssetLibraryProductionSyncService.sync(rows)` directly. It does not route through `VisualAssetLibraryWriteService.syncEligibleBatch()`, so it bypasses the strongest mode, scope, approval, batch-size, cursor, max-row, and dry-run-proof checks.

### 3. Dry-run and verify are not read-only

`VisualAssetLibraryProductionSyncService.runRows_()` always builds history entries and calls `VisualAssetLibrarySyncHistoryService.append(history)` regardless of operation. Therefore both `dryRun()` and `verify()` append rows to the bound spreadsheet's `Visual Sync History` sheet.

The production and sync managers also write status columns, notes, timestamps, backgrounds, conditional-format rules, and sometimes new columns. A dry-run through a manager is therefore a live Sheet mutation even when it performs no Notion update.

### 4. Partial batches are possible

Rows are processed sequentially. A successful early row can create or update a Notion page before a later row fails. Errors are caught per row and the batch continues. There is no transaction or rollback across the batch.

The final result can therefore contain a mixture of synced, partial, waiting, and failed rows. Retrying is intended to be idempotent by `file_id`, but duplicate Notion pages explicitly block a row and there is no automatic repair.

### 5. History is append-only and can be created during non-write operations

`VisualAssetLibrarySyncHistoryService.append()` creates the history sheet if missing and appends rows. No cleanup or rollback exists. History entries are operationally valuable, but they must be disclosed as permanent effects of dry-run, verify, and sync.

### 6. Manager dry-run changes configuration and status state

The sync manager:

- acquires a script lock;
- writes rows as `Currently syncing` before the operation;
- writes progress/status fields afterward;
- writes failure state on exceptions;
- changes `DM_NOTION_SYNC_MODE` and restores/reset it;
- changes cursor and pause properties for navigation actions.

This behavior must be classified as a mutation-bearing live workflow, not an offline test.

## Test-path findings

`testVisualAssetLibraryProductionSyncTestSuite()` does not call Notion write functions, but it does mutate Script Properties temporarily for keyword mode and dry-run proof tests. Those properties are restored in `finally` blocks.

The suite also asserts that global `findNotionPagesByFileId` and `upsertVisualAssetPage` functions exist. That existence test unintentionally protects the direct-write bypass from removal. The test should instead require that write entry points are guarded or intentionally not exported.

The suite is Apps Script-runtime dependent and should not run in ordinary Cloud Build PR validation.

## Hard-coded target findings

The approved Visual Asset Library data-source identifier is hard-coded in both the production sync service and the guarded write service. The runtime also reads a configured target property and compares it against the hard-coded value.

This is a useful allowlist, but it creates duplication and drift risk. One canonical target registry should own the approved identifier and expose only a redacted fingerprint in logs and operator output.

## Required remediation

1. Remove or guard the global `upsertVisualAssetPage()` entry point.
2. Route every write through one authorization service that enforces target, mode, scope, approvals, dry-run proof, batch bounds, and lock ownership.
3. Retire or convert `VisualAssetLibraryProductionManagerService` so it cannot bypass the guarded write service.
4. Separate pure preview from live verification:
   - offline preview must not call Notion or mutate Sheets;
   - live read-only verification may call Notion but must not write history or status unless explicitly requested;
   - mutation mode must be separately authorized.
5. Make history emission explicit by mode and include it in structured evidence.
6. Report partial-batch outcomes and never label a mixed batch as wholly successful.
7. Use one script lock/concurrency boundary for every write-capable entry point.
8. Replace duplicated hard-coded target values with a single target registry consumed by #18/#26 safeguards.

## Live-lane classification

| Lane | Allowed now? | Notes |
| --- | --- | --- |
| Offline unit/fixture tests | Yes, after #13 loader work | no Apps Script services or credentials |
| Live external read-only lookup | Not yet | must use explicit target and avoid status/history writes |
| Staging mutation | Blocked | direct bypasses must be removed first |
| Production mutation | Blocked | no approved production lane exists |

## Validation performed

Read-only source inspection only. No Apps Script function, Notion request, Sheet mutation, Script Property change, credential, deployment, or external system was used or modified.

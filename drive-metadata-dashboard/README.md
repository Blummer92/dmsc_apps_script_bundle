# Drive Metadata Dashboard

Read-only Apps Script sidebar for reviewing Drive image metadata under the approved tiered governance model, with guarded Notion staging sync helpers for validation workflows.

## Purpose

The dashboard console can display sheet metadata, preview Drive file links, compare prompt fields, show validation warnings, group duplicate candidates for review, show DM Source Library approval status/evidence as a read-only summary, and show handoff preview text for manual review.

The visible dashboard console cannot approve, merge, export, generate, promote, overwrite prompts, edit Drive, write back to Sheets, write to Notion, or update curriculum readiness.

Notion staging sync is only available through explicit Apps Script functions with staging-only guards.

## Project Structure

```txt
drive-metadata-dashboard
  src/Code.gs
  src/Config.gs
  src/DashboardService.gs
  src/GovernanceService.gs
  src/HandoffService.gs
  src/SheetReadService.gs
  src/NotionDryRun.gs
  src/NotionSyncService.gs
  src/Ui.html
  src/Styles.html
  src/Client.html
  scripts/clasp-sync.mjs
  scripts/codespaces-clasp-preflight-push.mjs
  metadata/handoff.json
  metadata/schema-map.json
  appsscript.json
  package.json
  README.md
  PILOT_CHECKLIST.md
  STAGING_SYNC_RUNBOOK.md
  .claspignore
  .clasp.json.example
```

## Workspace Views

These controls are navigation tabs only. They switch between read-only review views and do not approve, export, generate, merge, overwrite prompts, edit Drive, write back to Sheets, write to Notion, or update curriculum readiness.

- Scan
- Review
- Validation
- Source Summary
- Handoff Preview

## Required Script Properties

| Property | Required | Notes |
| --- | --- | --- |
| `DRIVE_METADATA_DASHBOARD_SPREADSHEET_ID` | No for bound scripts | Spreadsheet containing `Drive Images`. If omitted, the bound active spreadsheet is used. |
| `DRIVE_METADATA_SHEET_NAME` | No | Defaults to `Drive Images`. |
| `DM_SOURCE_LIBRARY_SPREADSHEET_ID` | For Notion dry run or staging sync | Source approval lookup spreadsheet. |
| `DM_SOURCE_LIBRARY_SHEET_NAME` | For Notion dry run or staging sync | Defaults to `DM Source Library`. |
| `DRIVE_METADATA_RESULT_LIMIT` | No | Number of metadata rows to read. |
| `DM_NOTION_STAGING_DATA_SOURCE_ID` | For dry run or staging sync | Must be the approved staging data source ID. |
| `DM_NOTION_STAGING_DATABASE_URL` | For dry run or staging sync | Staging database URL used to identify the Notion database. |
| `DM_NOTION_STAGING_DATABASE_ID` | Optional | Explicit Notion database ID; used instead of parsing the URL when present. |
| `DM_NOTION_API_TOKEN` | For staging sync only | Notion integration token with access to the staging database. |
| `DM_NOTION_SYNC_SCOPE` | For dry run or staging sync | `TEN_ROW_APPROVAL` or `ELIGIBLE_STAGING_BATCH`. |
| `DM_NOTION_SYNC_MODE` | For dry run or staging sync | Use `DRY_RUN` for validation or `STAGING_WRITE` for guarded staging sync. |
| `DM_NOTION_STAGING_WRITE_APPROVED` | For 10-row staging sync only | Must be `YES_10_ROWS_ONLY`. |
| `DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED` | For expanded staging batches only | Must be `YES_EXPANDED_STAGING_BATCH_ONLY`. |
| `DM_NOTION_SYNC_START_ROW` | For dry run or staging sync | Start row for the configured lane. |
| `DM_NOTION_SYNC_END_ROW` | For dry run or staging sync | End row for the configured lane. |
| `DM_NOTION_SYNC_CURSOR_ROW` | For expanded staging batches | First row to process in the current batch. |
| `DM_NOTION_SYNC_BATCH_SIZE` | For expanded staging batches | Defaults to `25`; maximum `50`. |
| `DM_NOTION_SYNC_MAX_END_ROW` | For expanded staging batches | Guardrail end row limit; defaults to `454`. |
| `DM_NOTION_TITLE_PROPERTY` | Optional | Defaults to `file_name`. |
| `DM_NOTION_FILE_ID_PROPERTY` | Optional | Defaults to `file_id`; used for create/update idempotency. |

## Read-Only Spreadsheet Access

Configured spreadsheet IDs are read through the Google Sheets advanced service using the `spreadsheets.readonly` OAuth scope. Bound-sheet reads still use `SpreadsheetApp.getActiveSpreadsheet()` for the active spreadsheet context.

Enable the Google Sheets advanced service in Apps Script if it is not already enabled, then reauthorize the project when prompted. Do not replace the read-only scope with full spreadsheet write scope for pilot testing.

## Notion Staging Sync

The 10-row validation lane remains available:

- `dryRunNotionRows2To11()` builds and logs the approved row 2-11 payloads without writing to Notion.
- `syncNotionRows2To11ToStaging()` writes rows 2-11 only after the 10-row staging guards pass.

The expanded staging batch lane is available for scaling eligible rows safely:

- `dryRunNotionEligibleStagingBatch()` builds one eligible-row batch without writing to Notion.
- `syncNotionEligibleStagingBatchToStaging()` writes one eligible-row batch after expanded staging guards pass.

Expanded batches are cursor-based. The function returns `next_cursor_row`; set `DM_NOTION_SYNC_CURSOR_ROW` to that value before the next batch. The script does not write progress back to Sheets.

Full operating steps are in `STAGING_SYNC_RUNBOOK.md`.

This is not production deployment and does not grant export, generation, prompt overwrite, production source approval, readiness updates, production Notion sync, or full Notion sync activation.

## Tier Logic

Every record must have exactly one Review Tier.

- Tier 1: searchable/reviewable inside dashboard only; never exportable.
- Tier 2: reference-only; never generation eligible.
- Tier 3: export/generation eligible only if DM Source Library approval evidence exists.
- Tier 4: audit-visible only; always blocked.

## Forbidden Behavior

This project must not include source approval, DM Source Library writes, Drive file edits, Google Sheets row edits, duplicate merge, prompt overwrite, eligibility promotion, readiness updates, blocked-record export, production Notion sync, or record creation/deletion.

## Pilot Packaging

Limited internal pilot guidance is tracked in `PILOT_CHECKLIST.md`. This pilot package does not approve production deployment.

## Codespaces clasp Preflight Push

Use this workflow when syncing from GitHub Codespaces to the bound Apps Script project.

```bash
cd /workspaces/dmsc_apps_script_bundle/drive-metadata-dashboard
git pull
cp .clasp.json.example .clasp.json
npm run clasp:login
npm run clasp:preflight-push
```

The preflight script checks all of the following before pushing:

- current folder is exactly `/workspaces/dmsc_apps_script_bundle/drive-metadata-dashboard`
- `.clasp.json` exists
- `.clasp.json` uses Script ID `1r8ZxoTdefHTE59qW9NuZqeBJHZhqg4XlKxNvV0fKP3u5uQa7Ov8vjKLr`
- no nested duplicate project folder should be used for pushing
- `src/NotionDryRun.gs`, `src/SheetReadService.gs`, `src/NotionSyncService.gs`, and `appsscript.json` are present
- `npx @google/clasp status` shows the required files as tracked
- `npx @google/clasp push` completes
- a second clasp status runs after push

If preflight fails because `.clasp.json` is missing, run:

```bash
cd /workspaces/dmsc_apps_script_bundle/drive-metadata-dashboard
cp .clasp.json.example .clasp.json
npm run clasp:preflight-push
```

If preflight fails because files are missing, run:

```bash
cd /workspaces/dmsc_apps_script_bundle/drive-metadata-dashboard
git pull
npm run clasp:preflight-push
```

After pushing, reload Apps Script and test dry runs first:

- `dryRunNotionRows2To11`
- `dryRunNotionEligibleStagingBatch`

Do not run staging sync functions until the required staging script properties are set. This workflow does not run Notion sync, modify Drive Images, create production records, or approve production deployment.

## clasp Deployment

Login once:

```bash
npm run clasp:login
```

Push this project to an existing Apps Script project by providing the Script ID from Apps Script Project Settings:

```bash
SCRIPT_ID="1r8ZxoTdefHTE59qW9NuZqeBJHZhqg4XlKxNvV0fKP3u5uQa7Ov8vjKLr" npm run clasp:push
```

Check deployment status or open the Apps Script project:

```bash
SCRIPT_ID="1r8ZxoTdefHTE59qW9NuZqeBJHZhqg4XlKxNvV0fKP3u5uQa7Ov8vjKLr" npm run clasp:status
SCRIPT_ID="1r8ZxoTdefHTE59qW9NuZqeBJHZhqg4XlKxNvV0fKP3u5uQa7Ov8vjKLr" npm run clasp:open
```

The helper writes `.clasp.json` locally from `SCRIPT_ID`. That local file is intentionally not committed.

Avoid `npm run clasp:pull` unless the Apps Script editor has newer manual edits that should replace your local files. Reload the bound spreadsheet and open `Drive Metadata > Open Dashboard` after pushing.

# Drive Metadata Dashboard

Read-only Apps Script sidebar for reviewing Drive image metadata under the approved tiered governance model.

## Purpose

The dashboard can display sheet metadata, preview Drive file links, compare prompt fields, show validation warnings, group duplicate candidates for review, show DM Source Library approval status/evidence as a read-only summary, and show handoff preview text for manual review.

The dashboard cannot approve, write, merge, export, promote, or update records.

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
| `DM_SOURCE_LIBRARY_SPREADSHEET_ID` | No | Source approval lookup spreadsheet. |
| `DM_SOURCE_LIBRARY_SHEET_NAME` | No | Defaults to `DM Source Library`. |
| `DRIVE_METADATA_RESULT_LIMIT` | No | Number of metadata rows to read. |
| `DM_NOTION_STAGING_DATA_SOURCE_ID` | For dry run or staging sync | Must be the approved staging data source ID for rows 2-11. |
| `DM_NOTION_STAGING_DATABASE_URL` | For dry run or staging sync | Staging database URL used to identify the Notion database. |
| `DM_NOTION_STAGING_DATABASE_ID` | Optional | Explicit Notion database ID; used instead of parsing the URL when present. |
| `DM_NOTION_API_TOKEN` | For staging sync only | Notion integration token with access to the staging database. |
| `DM_NOTION_SYNC_MODE` | For dry run or staging sync | Use `DRY_RUN` for validation or `STAGING_WRITE` for guarded staging sync. |
| `DM_NOTION_STAGING_WRITE_APPROVED` | For staging sync only | Must be `YES_10_ROWS_ONLY`. |
| `DM_NOTION_SYNC_START_ROW` | For dry run or staging sync | Must be `2`. |
| `DM_NOTION_SYNC_END_ROW` | For dry run or staging sync | Must be `11`. |
| `DM_NOTION_TITLE_PROPERTY` | Optional | Defaults to `file_name`. |
| `DM_NOTION_FILE_ID_PROPERTY` | Optional | Defaults to `file_id`; used for create/update idempotency. |

## Read-Only Spreadsheet Access

Configured spreadsheet IDs are read through the Google Sheets advanced service using the `spreadsheets.readonly` OAuth scope. Bound-sheet reads still use `SpreadsheetApp.getActiveSpreadsheet()` for the active spreadsheet context.

Enable the Google Sheets advanced service in Apps Script if it is not already enabled, then reauthorize the project when prompted. Do not replace the read-only scope with full spreadsheet write scope for pilot testing.

## Notion Staging Sync

`dryRunNotionRows2To11()` builds and logs the 10 approved row payloads without writing to Notion.

`syncNotionRows2To11ToStaging()` writes only to the configured Notion staging database. It is blocked unless all guards pass:

- `DM_NOTION_SYNC_MODE` is `STAGING_WRITE`.
- `DM_NOTION_STAGING_WRITE_APPROVED` is `YES_10_ROWS_ONLY`.
- Rows are exactly `2-11`.
- The staging data source ID is exactly `collection://bf703afb-7526-4b55-aefa-1c4976032509`.
- A Notion token is configured.

The staging sync creates or updates pages by `file_id`, verifies the 10 synced pages by querying Notion, and returns a sync summary. It is not production deployment and does not grant export, generation, prompt overwrite, production source approval, readiness updates, or full Notion sync activation.

## Tier Logic

Every record must have exactly one Review Tier.

- Tier 1: searchable/reviewable inside dashboard only; never exportable.
- Tier 2: reference-only; never generation eligible.
- Tier 3: export/generation eligible only if DM Source Library approval evidence exists.
- Tier 4: audit-visible only; always blocked.

## Forbidden Behavior

This project must not include source approval, DM Source Library writes, Drive file edits, Google Sheets row edits, duplicate merge, prompt overwrite, eligibility promotion, readiness updates, blocked-record export, or record creation/deletion.

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

After pushing, reload Apps Script and test these functions manually:

- `dryRunNotionRows2To11`
- `syncNotionRows2To11ToStaging`

Do not run the staging sync until the required staging script properties are set. This workflow does not run Notion sync, modify Drive Images, create production records, or approve production deployment.

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

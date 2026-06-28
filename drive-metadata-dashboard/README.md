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
  src/Ui.html
  src/Styles.html
  src/Client.html
  metadata/handoff.json
  metadata/schema-map.json
  appsscript.json
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
| `DM_NOTION_STAGING_DATA_SOURCE_ID` | For dry run | Must be the approved staging data source ID for `dryRunNotionRows2To11`. |
| `DM_NOTION_STAGING_DATABASE_URL` | For dry run | Staging database URL included in dry-run payload output. |
| `DM_NOTION_SYNC_MODE` | For dry run | Must be `DRY_RUN`. |
| `DM_NOTION_SYNC_START_ROW` | For dry run | Must be `2`. |
| `DM_NOTION_SYNC_END_ROW` | For dry run | Must be `11`. |

## Read-Only Spreadsheet Access

Configured spreadsheet IDs are read through the Google Sheets advanced service using the `spreadsheets.readonly` OAuth scope. Bound-sheet reads still use `SpreadsheetApp.getActiveSpreadsheet()` for the active spreadsheet context.

Enable the Google Sheets advanced service in Apps Script if it is not already enabled, then reauthorize the project when prompted. Do not replace the read-only scope with full spreadsheet write scope for pilot testing.

## Tier Logic

Every record must have exactly one Review Tier.

- Tier 1: searchable/reviewable inside dashboard only; never exportable.
- Tier 2: reference-only; never generation eligible.
- Tier 3: export/generation eligible only if DM Source Library approval evidence exists.
- Tier 4: audit-visible only; always blocked.

## Forbidden Behavior

This project must not include source approval, DM Source Library writes, Notion writes, Drive file edits, Google Sheets row edits, duplicate merge, prompt overwrite, eligibility promotion, readiness updates, blocked-record export, or record creation/deletion.

## Pilot Packaging

Limited internal pilot guidance is tracked in `PILOT_CHECKLIST.md`. This pilot package does not approve production deployment.

## clasp Deployment

```bash
cp .clasp.json.example .clasp.json
clasp push
```

Reload the bound spreadsheet and open `Drive Metadata > Open Dashboard`.

# Drive Metadata Dashboard

Read-only Apps Script sidebar for reviewing Drive image metadata under the approved tiered governance model.

## Purpose

The dashboard can display sheet metadata, preview Drive file links, compare prompt fields, show validation warnings, group duplicate candidates for review, show DM Source Library approval status/evidence as a read-only summary, and generate handoff text for manual review.

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
  src/Ui.html
  src/Styles.html
  src/Client.html
  metadata/handoff.json
  metadata/schema-map.json
  appsscript.json
  README.md
  .claspignore
  .clasp.json.example
```

## Sidebar Tabs

- Scan
- Review
- Validation
- Source Approval Summary
- Handoff

## Required Script Properties

| Property | Required | Notes |
| --- | --- | --- |
| `DRIVE_METADATA_DASHBOARD_SPREADSHEET_ID` | No for bound scripts | Spreadsheet containing `Drive Images`. If omitted, the bound active spreadsheet is used. |
| `DRIVE_METADATA_SHEET_NAME` | No | Defaults to `Drive Images`. |
| `DM_SOURCE_LIBRARY_SPREADSHEET_ID` | No | Source approval lookup spreadsheet. |
| `DM_SOURCE_LIBRARY_SHEET_NAME` | No | Defaults to `DM Source Library`. |
| `DRIVE_METADATA_RESULT_LIMIT` | No | Number of metadata rows to read. |

## Tier Logic

Every record must have exactly one Review Tier.

- Tier 1: searchable/reviewable inside dashboard only; never exportable.
- Tier 2: reference-only; never generation eligible.
- Tier 3: export/generation eligible only if DM Source Library approval evidence exists.
- Tier 4: audit-visible only; always blocked.

## Forbidden Behavior

This project must not include source approval, DM Source Library writes, Notion writes, Drive file edits, Google Sheets row edits, duplicate merge, prompt overwrite, eligibility promotion, readiness updates, blocked-record export, or record creation/deletion.

## clasp Deployment

```bash
cp .clasp.json.example .clasp.json
clasp push
```

Reload the bound spreadsheet and open `Drive Metadata > Open Dashboard`.

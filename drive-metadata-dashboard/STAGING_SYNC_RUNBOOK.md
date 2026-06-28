# Drive Metadata Dashboard Staging Sync Runbook

This runbook covers the guarded staging synchronization engine for DM Source Library metadata into the Notion staging database.

This is not production deployment. It does not approve sources, export assets, generate assets, overwrite prompts, merge duplicates, edit Drive, write back to Sheets, update Notion production, or update curriculum readiness.

## Sync Lanes

### 10-row approved validation lane

Use this lane for the currently approved rows 2-11.

Functions:

- `dryRunNotionRows2To11`
- `syncNotionRows2To11ToStaging`

Required properties:

```txt
DM_NOTION_SYNC_SCOPE=TEN_ROW_APPROVAL
DM_NOTION_SYNC_MODE=DRY_RUN
DM_NOTION_SYNC_START_ROW=2
DM_NOTION_SYNC_END_ROW=11
DM_NOTION_STAGING_DATA_SOURCE_ID=collection://bf703afb-7526-4b55-aefa-1c4976032509
```

For the write step only:

```txt
DM_NOTION_SYNC_MODE=STAGING_WRITE
DM_NOTION_STAGING_WRITE_APPROVED=YES_10_ROWS_ONLY
```

### Expanded eligible staging batch lane

Use this lane to scale safely toward the larger eligible set, eventually up to the configured maximum row range. It processes a small batch per run and returns `next_cursor_row` instead of writing progress back to the Sheet.

Functions:

- `dryRunNotionEligibleStagingBatch`
- `syncNotionEligibleStagingBatchToStaging`

Required properties:

```txt
DM_NOTION_SYNC_SCOPE=ELIGIBLE_STAGING_BATCH
DM_NOTION_SYNC_MODE=DRY_RUN
DM_NOTION_SYNC_START_ROW=2
DM_NOTION_SYNC_END_ROW=454
DM_NOTION_SYNC_CURSOR_ROW=2
DM_NOTION_SYNC_BATCH_SIZE=25
DM_NOTION_SYNC_MAX_END_ROW=454
DM_NOTION_STAGING_DATA_SOURCE_ID=collection://bf703afb-7526-4b55-aefa-1c4976032509
```

For the write step only:

```txt
DM_NOTION_SYNC_MODE=STAGING_WRITE
DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED=YES_EXPANDED_STAGING_BATCH_ONLY
```

## Shared Required Properties

```txt
DM_SOURCE_LIBRARY_SPREADSHEET_ID=<source spreadsheet id>
DM_SOURCE_LIBRARY_SHEET_NAME=<source sheet name>
DM_NOTION_STAGING_DATABASE_URL=<staging database URL>
DM_NOTION_API_TOKEN=<Notion integration token>
```

Optional properties:

```txt
DM_NOTION_STAGING_DATABASE_ID=<database id if URL parsing is not reliable>
DM_NOTION_TITLE_PROPERTY=file_name
DM_NOTION_FILE_ID_PROPERTY=file_id
```

## Expanded Eligibility Rules

A row is eligible for the expanded staging batch only when:

- `file_id`, `drive_url`, and `file_name` are present
- `do_not_include` is not true/yes/1
- `blocked_reason` is blank
- `review_tier` is not Tier 4
- if `notion_staging_eligible` exists, it is true/yes/1/eligible/approved
- `notion_staging_sync_status` is not `blocked`

Rows that do not pass are skipped and listed in the run result.

## Safe Batch Workflow

1. Push the latest project to Apps Script with the Codespaces preflight workflow.
2. Set the expanded lane properties with `DM_NOTION_SYNC_MODE=DRY_RUN`.
3. Run `dryRunNotionEligibleStagingBatch`.
4. Confirm the returned `eligible_payload_count`, `skipped_count`, and payload mapping.
5. Change `DM_NOTION_SYNC_MODE` to `STAGING_WRITE` and set `DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED=YES_EXPANDED_STAGING_BATCH_ONLY`.
6. Run `syncNotionEligibleStagingBatchToStaging`.
7. Confirm `synced_count` equals `verified_count`.
8. Set `DM_NOTION_SYNC_CURSOR_ROW` to the returned `next_cursor_row`.
9. Repeat dry run, then write, until `next_cursor_row` is `null`.

Keep `DM_NOTION_SYNC_BATCH_SIZE` at `25` until several batches pass. Do not exceed `50`.

## Apps Script Functions To Test

Start here:

- `dryRunNotionRows2To11`
- `dryRunNotionEligibleStagingBatch`

Only run write functions after dry-run review:

- `syncNotionRows2To11ToStaging`
- `syncNotionEligibleStagingBatchToStaging`

## Rollback / Stop Conditions

Stop immediately if:

- a dry run includes unexpected rows
- a row maps to the wrong Notion database
- duplicate Notion pages are found for the same `file_id`
- `synced_count` and `verified_count` do not match
- production approval, export, generation, merge, prompt overwrite, Drive edit, Sheet write-back, Notion production write, or readiness update behavior appears

Route governance questions to the Modeling & Dashboard Governance Agent before expanding scope further.

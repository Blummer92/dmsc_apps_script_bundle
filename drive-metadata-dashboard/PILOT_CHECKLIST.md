# Drive Metadata Dashboard Pilot Checklist

## Limited Internal Pilot Scope

- Use this package only for limited internal review of the Drive Metadata Dashboard / Digital Media Operations Console.
- Confirm the console opens, loads configured sheet data, and displays Workspace Views as navigation tabs.
- Review the Scan, Review, Validation, Source Summary, and Handoff Preview views for clarity and governance fit.
- Treat all computed export, generation, duplicate, source, and readiness fields as read-only review signals.
- Test the 10-row Notion staging sync only through the guarded `syncNotionRows2To11ToStaging` Apps Script function.
- This checklist does not approve production deployment.

## Dashboard Read-Only Restrictions

The visible dashboard console must remain read-only during pilot review. It must not:

- approve sources or records
- export records or files
- generate assets or prompts
- merge duplicate records
- overwrite approved prompts
- edit Drive files
- write back to Sheets
- update curriculum readiness
- promote export or generation eligibility

## Guarded Notion Staging Sync Restrictions

The only permitted Notion write path is `syncNotionRows2To11ToStaging`, and only when all guards pass:

- `DM_NOTION_SYNC_MODE` is `STAGING_WRITE`
- `DM_NOTION_STAGING_WRITE_APPROVED` is `YES_10_ROWS_ONLY`
- row scope is exactly `2-11`
- the staging data source ID is exactly `collection://bf703afb-7526-4b55-aefa-1c4976032509`
- the target is the Notion staging database, not production

## Tester Instructions

1. Open the bound spreadsheet and launch `Drive Metadata > Open Dashboard`.
2. Confirm the persistent banner says: `Read-only review console. This workspace does not approve, export, generate, merge, overwrite prompts, or update readiness.`
3. Confirm the visible navigation group is labeled `Workspace Views`.
4. Confirm the visible tabs include `Handoff Preview`, not `Handoff`, when referring to the navigation tab.
5. Move through each Workspace View and confirm tabs only change the visible panel.
6. Run `dryRunNotionRows2To11` and verify it returns exactly 10 payloads without writing to Notion.
7. Run `syncNotionRows2To11ToStaging` only after the staging write properties are set.
8. Verify the staging database contains one page per synced `file_id` for rows 2-11.
9. Record any confusing wording, unexpected warnings, or missing data in the pilot review notes.

## Disabled Actions

The following actions remain intentionally unavailable:

- production export actions
- generation actions
- production approval actions
- duplicate merge actions
- prompt overwrite actions
- Drive edit or delete actions
- Sheet write-back actions
- production Notion sync actions
- curriculum readiness update actions

## Rollback Guidance

- If pilot testers find confusing wording or layout issues, revert the latest pilot documentation or label change and keep the guarded sync function disabled.
- If unexpected write behavior is discovered outside `syncNotionRows2To11ToStaging`, stop pilot use immediately and route the finding to the Modeling & Dashboard Governance Agent before further review.
- Do not expand pilot access or prepare production deployment until governance review explicitly approves the next stage.

# Drive Metadata Dashboard Pilot Checklist

## Limited Internal Pilot Scope

- Use this package only for limited internal review of the Drive Metadata Dashboard / Digital Media Operations Console.
- Confirm the console opens, loads configured sheet data, and displays Workspace Views as navigation tabs.
- Review the Scan, Review, Validation, Source Summary, and Handoff Preview views for clarity and governance fit.
- Treat all computed export, generation, duplicate, source, and readiness fields as read-only review signals.
- This checklist does not approve production deployment.

## Read-Only Restrictions

The console must remain read-only during pilot review. It must not:

- approve sources or records
- export records or files
- generate assets or prompts
- merge duplicate records
- overwrite approved prompts
- edit Drive files
- write back to Sheets
- write to Notion
- update curriculum readiness
- promote export or generation eligibility

## Tester Instructions

1. Open the bound spreadsheet and launch `Drive Metadata > Open Dashboard`.
2. Confirm the persistent banner says: `Read-only review console. This workspace does not approve, export, generate, merge, overwrite prompts, or update readiness.`
3. Confirm the visible navigation group is labeled `Workspace Views`.
4. Confirm the visible tabs include `Handoff Preview`, not `Handoff`, when referring to the navigation tab.
5. Move through each Workspace View and confirm tabs only change the visible panel.
6. Review duplicate, source, export, generation, prompt, and readiness indicators as display-only signals.
7. Record any confusing wording, unexpected warnings, or missing data in the pilot review notes.

## Disabled Actions

The following actions are intentionally unavailable in the console:

- export actions
- generation actions
- approval actions
- duplicate merge actions
- prompt overwrite actions
- Drive edit or delete actions
- Sheet write-back actions
- Notion write or update actions
- curriculum readiness update actions

## Rollback Guidance

- If pilot testers find confusing wording or layout issues, revert the latest pilot documentation or label change and keep the read-only implementation in place.
- If any write behavior is discovered, stop pilot use immediately and route the finding to the Modeling & Dashboard Governance Agent before further review.
- Do not expand pilot access or prepare production deployment until governance review explicitly approves the next stage.

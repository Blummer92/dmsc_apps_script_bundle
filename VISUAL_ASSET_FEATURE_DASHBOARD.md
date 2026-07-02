# Visual Asset Feature Dashboard

This feature extends the warning-only Visual Asset Metadata validation dashboard without changing existing asset rows.

## Added Source File

- `VisualAssetGovernanceFeatureViews.gs`

## New Apps Script Functions

Run these one at a time after pulling the branch and pushing with clasp:

1. `testVisualAssetFeatureDashboardLoggingOnly`
   - Logs the planned dashboard sections.
   - Does not write to the spreadsheet.

2. `getVisualAssetStatusReviewSummary`
   - Returns counts for `Blocked`, `Needs Human Review`, `Needs Metadata`, and `Complete`.
   - Logs `STATUS_SUMMARY` records.

3. `getVisualAssetDriveFileIdReviewQueue`
   - Returns Drive File ID suggestions and mismatch review items.
   - Logs `DRIVE_ID_REVIEW` records when present.

4. `getVisualAssetDuplicateAssetIdGroups`
   - Returns grouped duplicate Asset IDs with affected row numbers.
   - Logs `DUPLICATE_ASSET_GROUP` records when present.

5. `getVisualAssetWorkflowBlockers`
   - Returns grouped rows blocked from advancing.
   - Logs `WORKFLOW_BLOCKER_SUMMARY` records when present.

6. `runVisualAssetFullFeatureDashboard`
   - Rebuilds the `Validation Dashboard` tab with all feature sections.
   - Writes only to `Validation Dashboard`.
   - Does not write to `Visual Asset Metadata`.

## Dashboard Layout

- `A1:B5`: dashboard header
- `A7:B14`: summary metrics
- `A16:G22`: Top Fixes
- `A24:D29`: Status Filter View
- `A32:F43`: Drive File ID Review Queue
- `A46:D57`: Duplicate Asset ID Drilldown
- `A60:E71`: Workflow Blocker Summary
- `A75:H`: detailed warning table

## Expected Execution Log Markers

Look for these prefixes in the Apps Script execution log:

- `[VAM_FEATURE] FEATURE_TEST_START`
- `[VAM_FEATURE_SHEET] TEST ONLY: would write ...`
- `[VAM_FEATURE] FEATURE_REPORT_READY`
- `[VAM_FEATURE] STATUS_SUMMARY`
- `[VAM_FEATURE] DRIVE_ID_REVIEW`
- `[VAM_FEATURE] DUPLICATE_ASSET_GROUP`
- `[VAM_FEATURE] WORKFLOW_BLOCKER_SUMMARY`
- `[VAM_FEATURE] FEATURE_DASHBOARD_WRITE_COMPLETE`

## Codespace Update And Push

```bash
cd /workspaces/dmsc_apps_script_bundle
git pull --ff-only origin codex/visual-asset-governance-validator
clasp push
```

If `git pull --ff-only` is blocked by local changes, run `git status --short` first and keep the local work instead of overwriting it.

## Safety Boundary

This feature is warning-only. It does not approve assets, advance workflow, lock rows, overwrite human-entered values, or migrate historical data.

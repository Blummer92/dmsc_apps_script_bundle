# Visual Asset Metadata Governance Validator

This documents the warning-only governance validator added for the `Visual Asset Metadata` workbook.

## What It Adds

- `VisualAssetGovernance.gs`
- `VisualAssetGovernanceMenu.gs` with standalone-safe trigger/control helpers
- Public runner: `runVisualAssetValidationDashboard()`
- Manual runner alias: `runVisualAssetValidationDashboardNow()`
- Daily trigger installer: `installDailyVisualAssetValidationTrigger()`
- Trigger cleanup: `removeVisualAssetValidationTriggers()`
- Read-only summary: `getVisualAssetValidationSummary()`
- Read-only report builder: `buildVisualAssetValidationReport()`
- Helper report functions:
  - `getVisualAssetMissingRequiredFields()`
  - `getVisualAssetDriveFileIdSuggestions()`
  - `getVisualAssetCanonicalFilenameSuggestions()`

## Safety Boundary

The validator does not change asset rows. It writes only to the generated `Validation Dashboard` tab in the Visual Asset Metadata workbook.

It does not:

- approve assets
- overwrite human-entered values
- migrate historical data
- enable protected ranges
- advance workflow stages
- lock approvals
- send notifications

## Target Workbook

The validator currently targets:

- Spreadsheet ID: `19rnFcTTs2zdaOs3wyZ_0NebjzczTPY9EqaLsybEU6bw`
- Asset tab: `Visual Asset Metadata`
- Generated dashboard tab: `Validation Dashboard`

## How To Run Manually

1. Push this bundle to the existing Apps Script project.
2. Open the Apps Script editor.
3. Run `runVisualAssetValidationDashboard()` or `runVisualAssetValidationDashboardNow()`.
4. Authorize the script if prompted.
5. Open the Visual Asset Metadata workbook and review the `Validation Dashboard` tab.

## Optional Daily Trigger

This project is currently deployed as a standalone Apps Script project. Because of that, `SpreadsheetApp.getUi()` and spreadsheet custom menus are not available from this project context.

To refresh the dashboard automatically each day:

1. In the Apps Script editor, run `installDailyVisualAssetValidationTrigger()` once.
2. Confirm authorization if prompted.
3. The script will run `runVisualAssetValidationDashboard()` daily at approximately 7 AM in the script timezone.

To remove old failed menu triggers or the daily validation trigger, run:

```javascript
removeVisualAssetValidationTriggers()
```

## Why There Is No Spreadsheet Menu Here

Custom spreadsheet menus require a container-bound Apps Script project. This project is standalone, so the supported controls are manual editor runs and installable time-based triggers.

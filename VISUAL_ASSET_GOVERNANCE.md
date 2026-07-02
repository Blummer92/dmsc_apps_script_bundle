# Visual Asset Metadata Governance Validator

This file documents the warning-only governance validator added for the `Visual Asset Metadata` workbook.

## What It Adds

- `VisualAssetGovernance.gs`
- Public runner: `runVisualAssetValidationDashboard()`
- Read-only report builder: `buildVisualAssetValidationReport()`
- Generated dashboard tab: `Validation Dashboard`
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

## How To Run

1. Push this bundle to the existing Apps Script project.
2. Open the Apps Script editor.
3. Run `runVisualAssetValidationDashboard()`.
4. Authorize the script if prompted.
5. Open the Visual Asset Metadata workbook and review the `Validation Dashboard` tab.

## What To Check In The Apps Script Execution Log

The script logs with the `[VAM_GOV]` and `[VAM_GOV_SHEET]` prefixes. These messages stay in the Apps Script execution log and are not written to an extra spreadsheet tab.

Look for these events in the latest run:

- `RUN_START`
- `READ_HEADERS`
- `READ_COMPLETE`
- `VALIDATION_STEP`
- `DASHBOARD_WRITE_COMPLETE`
- `RUN_COMPLETE`

## Optional Menu Wiring

The existing project already owns `onOpen()` in `Code.gs`. To add a menu item after this module is installed, add these lines to the existing `DMSC Dashboard` menu chain:

```javascript
.addSeparator()
.addItem('Refresh Visual Asset Validation', 'runVisualAssetValidationDashboard')
```

Keep only one `onOpen()` function in the Apps Script project.

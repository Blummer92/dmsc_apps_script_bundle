# Visual Asset Metadata Governance Validator

This documents the warning-only governance validator added for the `Visual Asset Metadata` workbook.

## What It Adds

- `VisualAssetGovernance.gs`
- `VisualAssetGovernanceMenu.gs`
- Public runner: `runVisualAssetValidationDashboard()`
- Menu installer: `installVisualAssetGovernanceMenuTrigger()`
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
3. Run `runVisualAssetValidationDashboard()`.
4. Authorize the script if prompted.
5. Open the Visual Asset Metadata workbook and review the `Validation Dashboard` tab.

## Menu Setup

The existing project already owns `onOpen()` in `Code.gs`, so this bundle avoids adding a second `onOpen()` function. To add a separate spreadsheet menu safely:

1. Push `VisualAssetGovernance.gs` and `VisualAssetGovernanceMenu.gs` to Apps Script.
2. In the Apps Script editor, run `installVisualAssetGovernanceMenuTrigger()` once.
3. Reload the Visual Asset Metadata spreadsheet.
4. Use the new `Visual Asset Governance` menu.

Menu items:

- `Refresh Validation Dashboard` runs `runVisualAssetValidationDashboardFromMenu()`.
- `Show Missing Required Count` runs `showVisualAssetMissingRequiredCount()`.
- `Remove Visual Asset Menu Trigger` removes the installable open trigger.

Keep only one simple `onOpen()` function in the Apps Script project. The existing `Code.gs` `onOpen()` remains the owner of the `DMSC Dashboard` menu.

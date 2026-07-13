# Validation Checklist

Use this checklist before a builder agent starts work from the registry.

## Registry Structure

- [ ] Registry spreadsheet ID is stored in Script Properties as `REGISTRY_SPREADSHEET_ID`.
- [ ] Spreadsheet contains a tab named `Apps Script Project Registry`.
- [ ] Header row includes all core fields.
- [ ] No required field names have been renamed.
- [ ] No field migration has been performed without human review.

## Required Project Metadata

- [ ] `Script Project Name` is present.
- [ ] `Apps Script Project ID` is present.
- [ ] `Script URL` is present.
- [ ] `Drive File ID` is present.
- [ ] `GitHub Repository` is present.
- [ ] `Branch` is present.
- [ ] `Builder Status` is present.
- [ ] `Next Action` is present.
- [ ] `Blocking Issue` is present when the project is blocked.

## Builder Start Here Review

- [ ] Existing `Client.html` is preserved or intentionally replaced only after review.
- [ ] `Ui.html` assigns `window.START_HERE_REPORT` before `Client.html` runs.
- [ ] Ready projects are visible.
- [ ] Blocked projects are visible.
- [ ] Projects missing metadata are visible.
- [ ] Each listed project includes a next action.
- [ ] Each ready project includes script and repository location.
- [ ] Missing metadata is logged with row number and field names.

## Safety Review

- [ ] No production writes are implemented.
- [ ] No deleting or renaming fields is implemented.
- [ ] No duplicate cleanup is implemented.
- [ ] No deployment queue is implemented.
- [ ] No generated prompt formulas are implemented.
- [ ] Governance decisions remain blocked pending Dashboard Sync review.

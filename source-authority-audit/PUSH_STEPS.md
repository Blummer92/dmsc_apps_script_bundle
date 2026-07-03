# Push Steps

Target Apps Script project:

`1XyFLtngqGWq6nYegE3tkiHZiOHS1XmzNCiEJFX2OnoTGowiWGnkOfYN6`

Project URL:

`https://script.google.com/home/projects/1XyFLtngqGWq6nYegE3tkiHZiOHS1XmzNCiEJFX2OnoTGowiWGnkOfYN6/edit`

## Files In This Folder

- `.clasp.json`
- `appsscript.json`
- `VAM_SourceApprovedAudit.gs`
- `VAM_SourceApprovedAuditSmokeTest.gs`
- `VAM_SourceApprovedAuditTests.gs`

## Push With clasp

From this folder:

```bash
clasp login
clasp push
```

If prompted, confirm that you want to update the project.

## Test Order

1. Run `runSourceApprovedVisualAssetAuditTests`.
2. Run `setSourceApprovedAuditSpreadsheetId('PASTE_VISUAL_ASSET_METADATA_SPREADSHEET_ID')`.
3. Run `smokeTestSourceApprovedVisualAssetAudit`.
4. Run `runSourceApprovedVisualAssetAudit`.

The audit reads the Sheet only and does not update Notion, the Sheet, or Drive.

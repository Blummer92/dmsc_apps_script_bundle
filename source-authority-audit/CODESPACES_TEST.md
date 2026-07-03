# Codespaces Test Flow

Use this folder as the root for the Apps Script test push.

## 1. Local Fixture Test

Run this first inside Codespaces:

```bash
node test-local.js
```

Expected:

```text
Local Codespaces fixture test passed.
```

## 2. Install clasp

```bash
npm install -g @google/clasp
```

## 3. Login

```bash
clasp login
```

Open the printed Google login URL, authorize, then return to Codespaces.

## 4. Confirm Target Project

```bash
cat .clasp.json
clasp status
```

The script ID should be:

```text
1XyFLtngqGWq6nYegE3tkiHZiOHS1XmzNCiEJFX2OnoTGowiWGnkOfYN6
```

## 5. Push

```bash
clasp push
```

## 6. Run In Apps Script

Open:

```text
https://script.google.com/home/projects/1XyFLtngqGWq6nYegE3tkiHZiOHS1XmzNCiEJFX2OnoTGowiWGnkOfYN6/edit
```

Run in this order:

```javascript
runSourceApprovedVisualAssetAuditTests()
setSourceApprovedAuditSpreadsheetId('PASTE_VISUAL_ASSET_METADATA_SPREADSHEET_ID')
smokeTestSourceApprovedVisualAssetAudit()
runSourceApprovedVisualAssetAudit()
```

The audit reads the Sheet only. It does not update Notion, the Sheet, or Drive.

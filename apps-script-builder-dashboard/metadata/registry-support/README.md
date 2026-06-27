# Apps Script Project Registry Support Module

Minimum viable, read-only Apps Script support module for builder agents.

This module helps a builder agent answer one question quickly: where should I start, and what is blocking me?

This version is designed to be added to an existing Apps Script repo/project as a separate module. It is not a standalone governance system.

## Workspace Target

- Google Workspace target: Google Sheets, Apps Script, and optional Apps Script web app.
- User-facing output: Builder Start Here workflow and validation summary.
- Data posture: read-only first.
- Governance posture: no production writes, no field migration, no duplicate cleanup, and no source-of-truth decisions.

## File Structure

Current isolated PR layout:

```txt
apps-script-builder-dashboard/src/registry-support
  BuilderRegistry.gs
  BuilderValidation.gs
  BuilderStartHere.gs
  BuilderRegistryConfig.gs
  BuilderRegistryServices.gs
  BuilderRegistryUi.html
  BuilderRegistryStyles.html
  Client.html
```

Supporting handoff files:

```txt
apps-script-builder-dashboard/metadata/registry-support
  handoff.json
  schema-map.json
  validation-checklist.md
  README.md
```

## Registry Sheet

Use a Google Sheet tab named:

```txt
Apps Script Project Registry
```

Required header row:

```txt
Script Project Name
Apps Script Project ID
Script URL
Drive File ID
GitHub Repository
Branch
Builder Status
Next Action
Blocking Issue
```

`Blocking Issue` column must exist, but the cell may be blank. The other metadata fields are required for a project to be considered ready for builder attention.

## Setup

1. Open the existing Apps Script project or repo.
2. Keep the files isolated under `src/registry-support/` for this MVP.
3. Do not replace an existing `doGet()`.
4. If UI routing is later approved, call `getBuilderStartHereHtml()` from the existing router.
5. In Apps Script project settings, add this Script Property:

```txt
REGISTRY_SPREADSHEET_ID = your Google Sheet ID
```

6. Confirm the registry spreadsheet has a tab named `Apps Script Project Registry`.
7. Run `validateAppsScriptProjectRegistry()`.
8. Run `runBuilderStartHere()`.

## Apps Script Functions

- `runBuilderStartHere()`: reads the registry, validates each project, logs and returns the Builder Start Here report.
- `validateAppsScriptProjectRegistry()`: returns validation results for all registry projects.
- `getBuilderStartHereJson()`: returns the Start Here report as formatted JSON.
- `getBuilderStartHereHtml()`: returns the optional Builder Start Here HTML view without replacing `doGet()`.
- `readBuilderRegistryRows()`: reads registry rows in one batch.
- `validateBuilderRegistryProject(project)`: checks one project for missing metadata and status.
- `validateBuilderRegistryProjects(projects)`: validates all registry rows.
- `buildBuilderStartHereReport(validations)`: groups projects into ready, blocked, and missing metadata categories.

## UI Contract

`BuilderRegistryUi.html` assigns:

```js
window.START_HERE_REPORT
```

before loading `Client.html`.

The server generates this report shape:

```json
{
  "summary": {
    "totalProjects": 0,
    "readyProjects": 0,
    "blockedProjects": 0,
    "projectsMissingMetadata": 0
  },
  "safeMode": true,
  "readyProjects": [],
  "blockedProjects": [],
  "projectsMissingMetadata": []
}
```

Each project object includes:

```json
{
  "rowNumber": 0,
  "projectName": "",
  "builderStatus": "",
  "nextAction": "",
  "blockingIssue": "",
  "appsScriptProjectId": "",
  "scriptUrl": "",
  "driveFileId": "",
  "githubRepository": "",
  "branch": "",
  "missingFields": []
}
```

## Status Rules

A project is treated as `ready` when:

- `Builder Status` is `Ready`
- required metadata is complete
- `Blocking Issue` is blank

This means ready for builder attention only. It does not mean production readiness, curriculum readiness, deployment approval, or source-of-truth approval.

A project is treated as `blocked` when:

- `Builder Status` is `Blocked`, or
- `Blocking Issue` is not blank

A project is listed as missing metadata when any required metadata field except `Blocking Issue` is blank.

A project may appear in both blocked and missing-metadata sections if both conditions are true.

## Safe Defaults

This project does not:

- write to production data
- delete fields
- rename fields
- migrate schemas
- clean duplicates
- generate prompt formulas
- run deployment queues
- overwrite readiness or production statuses

All missing metadata is logged with row number and field names.

## Clear Blockers

Dashboard/governance work is blocked until the Dashboard Sync Agent or owner dashboard confirms:

- field ownership
- source-of-truth schema
- duplicate risk
- whether any registry fields should be summary-only
- whether downstream agents can consume the metadata contract safely

See `metadata/handoff.json` for the governance handoff packet.

# Apps Script Project Registry Support Module

Minimum viable, read-only Apps Script support module for builder agents.

This project helps a builder agent answer one question quickly: where should I start, and what is blocking me?

This version is designed to be added to an existing Apps Script repo/project as a separate module. It is not a full standalone governance system.

## Workspace Target

- Google Workspace target: Google Sheets, Apps Script, and optional Apps Script web app.
- User-facing output: Builder Start Here workflow and validation summary.
- Data posture: read-only first.
- Governance posture: no production writes, no field migration, no duplicate cleanup, and no source-of-truth decisions.

## File Structure

Recommended integration layout:

```txt
src
  BuilderRegistry.gs
  BuilderValidation.gs
  BuilderStartHere.gs
  Config.gs
  Services.gs
  Ui.html
  Styles.html
  Client.html
```

Supporting handoff files included in this package:

```txt
metadata
  handoff.json
  schema-map.json
  validation-checklist.md
```

## Registry Sheet

Create or identify a Google Sheet tab named:

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

`Blocking Issue` is allowed to be blank. All other fields are required for a project to be considered ready.

## Setup

1. Open the existing Apps Script project or repo.
2. Copy the files in `src/` into the existing `src/` directory.
3. Keep the existing uploaded `Client.html` as the client render file when present. This package's `Client.html` uses the same `window.START_HERE_REPORT` contract.
4. In Apps Script project settings, add this Script Property:

```txt
REGISTRY_SPREADSHEET_ID = your Google Sheet ID
```

5. Confirm the registry spreadsheet has a tab named `Apps Script Project Registry`.
6. Run `validateAppsScriptProjectRegistry`.
7. Run `runBuilderStartHere`.

## Optional Clasp Setup

Copy `.clasp.json.example` to `.clasp.json`, then replace:

```txt
PASTE_APPS_SCRIPT_PROJECT_ID_HERE
```

with the target Apps Script project ID.

Then push with:

```bash
clasp push
```

## Apps Script Functions Generated

- `runBuilderStartHere()`: reads the registry, validates each project, logs and returns the Builder Start Here report.
- `validateAppsScriptProjectRegistry()`: returns a validation result for all registry projects.
- `getBuilderStartHereJson()`: returns the Start Here report as formatted JSON.
- `doGet()`: serves the optional Builder Start Here web app view.
- `readBuilderRegistryRows()`: reads registry rows in one batch.
- `validateBuilderRegistryProject(project)`: checks one project for missing metadata and status.
- `validateBuilderRegistryProjects(projects)`: validates all registry rows.
- `buildBuilderStartHereReport(validations)`: groups projects into ready, blocked, and missing metadata categories.

## Builder Start Here Output

The server generates `window.START_HERE_REPORT` with this shape:

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

The UI shows:

- ready projects
- blocked projects
- projects missing metadata
- all projects
- next action for each project
- script location
- Drive file ID
- GitHub repository and branch
- blocking issue
- missing metadata fields

## Status Rules

A project is treated as `ready` when:

- `Builder Status` is `Ready`
- no required metadata is missing
- `Blocking Issue` is blank

A project is treated as `blocked` when:

- `Builder Status` is `Blocked`, or
- `Blocking Issue` is not blank

A project is listed as `projects missing metadata` when any required metadata field is blank.

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

## Test Steps

1. In Apps Script, set Script Property `REGISTRY_SPREADSHEET_ID`.
2. Confirm the registry spreadsheet has the `Apps Script Project Registry` tab and required headers.
3. Run `runBuilderStartHere()` from the Apps Script editor.
4. Confirm the execution log shows a report with `safeMode: true`.
5. Run `validateAppsScriptProjectRegistry()` and confirm missing metadata is listed by project.
6. Deploy or test the web app entry point.
7. Open the UI and confirm it renders ready, blocked, and missing-metadata project sections.

## Deployment Notes

For internal web app use, deploy as:

- Execute as: User deploying
- Access: domain access, or narrower if required by your Workspace policy

The web app only reads the configured registry spreadsheet and renders the Start Here report.

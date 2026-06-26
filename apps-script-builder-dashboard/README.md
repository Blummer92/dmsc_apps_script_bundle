# Apps Script Builder Dashboard

This project creates a clasp-ready Google Apps Script dashboard for Apps Script operational project metadata and related logs.

## Approved Boundary

This dashboard owns Apps Script operational metadata only.

It does not own:

- curriculum readiness
- lesson decisions
- packet approval
- source authority
- evidence readiness
- reuse approval
- final generation approval

Those fields must remain relation, lookup, or summary-only when shown here.

## Approved Databases

The dashboard creates five Google Sheets tabs:

1. Apps Script Projects
2. Project Logs
3. Handoff Records
4. Change Log
5. Agent/Data Contracts

## Project Structure

```txt
apps-script-builder-dashboard
  src
    Code.gs
    Config.gs
    Services.gs
    Validation.gs
    Logging.gs
    SyncGuards.gs
    Ui.html
    Styles.html
    Client.html
  metadata
    field-contract.json
    handoff.json
    schema-map.json
    change-log-schema.json
  appsscript.json
  README.md
  .clasp.json.example
```

## Setup

1. Create or choose a Google Sheet to hold the dashboard.
2. Create an Apps Script project bound to that Sheet, or push this project with clasp.
3. Copy `.clasp.json.example` to `.clasp.json` and set the real script ID if using clasp.
4. Run `setupDashboard(spreadsheetId)` once with the dashboard spreadsheet ID.
5. Reload the spreadsheet and open **Builder Dashboard > Open Dashboard**.

## Main Functions

- `setupDashboard(spreadsheetId)`: creates the approved five-tab schema and seeds the field contract.
- `createProject(project)`: creates an Apps Script operational project record.
- `logBug(projectId, summary, options)`: records a bug and prevention rule.
- `logDecision(projectId, summary, options)`: records an operational code or schema decision.
- `logPerformance(projectId, actionName, durationMs, options)`: records interface or workflow timing.
- `createHandoffRecord(handoff)`: records a governance-safe handoff to another owner agent.
- `filterAppsScriptOperationalPayload(payload)`: blocks non-operational sync fields.
- `assertCurriculumFieldsAreLookupOnly(payload)`: blocks curriculum-authority writes.

## Safe Field Rules

The dashboard may create and update:

- `project_id`
- `project_name`
- `agent_owner`
- `workspace_target`
- `output_type`
- `generated_artifact`
- `last_synced_at`
- `build_status`
- `deployment_status`
- `project_risk_level`
- Apps Script-specific logs

The dashboard must not write editable versions of:

- `unit_id`
- `lesson_id`
- `packet_id`
- `readiness_status`
- `source_document`
- source authority
- lesson decisions
- packet approval
- final generation approval

Use the approved lookup/relation labels instead:

- `unit_id_lookup`
- `lesson_id_lookup`
- `packet_id_lookup`
- `curriculum_readiness_lookup`
- `source_document_relation`

## Deployment Notes

This first version is intentionally schema-first. It prepares safe Sheets-backed storage, logging, and guardrails before any live Notion or curriculum metadata sync is connected.

Before adding external sync, confirm:

- relation and lookup fields are non-editable
- Apps Script sync writes only operational metadata and Apps Script-specific logs
- Drive Operations Manager has approved file/folder ownership for generated artifacts
- Dashboard Sync Agent has approved any downstream mapping

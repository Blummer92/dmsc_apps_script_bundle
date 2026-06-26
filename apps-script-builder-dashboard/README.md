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

The dashboard creates five Google Sheets tabs. The approved database name `Agent/Data Contracts` is implemented as the Sheets-safe tab name `Agent Data Contracts`.

1. Apps Script Projects
2. Project Logs
3. Handoff Records
4. Change Log
5. Agent Data Contracts

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
    appsscript.json
  metadata
    field-contract.json
    handoff.json
    schema-map.json
    change-log-schema.json
  appsscript.json
  README.md
  .clasp.json.example
```

`src/appsscript.json` is the deployable manifest used by clasp because `.clasp.json.example` sets `rootDir` to `src`. The root-level `appsscript.json` is retained as a reference copy only.

## Setup

1. Create or choose a Google Sheet to hold the dashboard.
2. Create an Apps Script project bound to that Sheet, or push this project with clasp.
3. Copy `.clasp.json.example` to `.clasp.json` and set your local script identifier if using clasp.
4. Keep `.clasp.json` local and keep private workspace identifiers out of commits.
5. Confirm clasp uses `src/` as `rootDir` and that the deployable manifest is `src/appsscript.json`.
6. Run `setupDashboard(spreadsheetId)` once with the dashboard spreadsheet ID.
7. Reload the spreadsheet and open **Builder Dashboard > Open Dashboard**.

## Main Functions

- `setupDashboard(spreadsheetId)`: creates the approved five-tab schema and seeds the field contract.
- `setSyncMode(mode)`: sets sync mode to `mock` or `live`; new installs default to `mock`.
- `getSyncMode()`: returns the active sync mode.
- `prepareOperationalSync(payload, currentRecord, options)`: validates an operational sync payload and returns a dry-run diff before any live write.
- `createProject(project)`: creates an Apps Script operational project record.
- `logBug(projectId, summary, options)`: records a bug and prevention rule.
- `logDecision(projectId, summary, options)`: records an operational code or schema decision.
- `logPerformance(projectId, actionName, durationMs, options)`: records interface or workflow timing.
- `createHandoffRecord(handoff)`: records a governance-safe handoff to another owner agent.
- `filterAppsScriptOperationalPayload(payload)`: blocks non-operational sync fields.
- `assertCurriculumFieldsAreLookupOnly(payload)`: blocks curriculum-authority writes.

## MVP Sync Guardrails

New installs default to `mock` sync mode. Live sync is not enabled by default.

The dashboard uses:

- an explicit writable-field allowlist
- a denylist for lookup, relation, readiness, source, curriculum identity, and approval fields
- a blanket block on fields ending in `_lookup`
- dry-run diff output before any live write
- audit log entries for attempted live sync

Live Notion sync, curriculum writeback, readiness writeback, and source-authority sync remain blocked for MVP testing.

Live writes to relation fields require owner review confirmation. Live writes also require `live_write_confirmed=true` after dry-run review.

## Safe Field Rules

The dashboard may create and update:

- `project_id`
- `project_name`
- `agent_owner`
- `workspace_target`
- `output_type`
- `generated_artifact`
- `generated_artifact_file_id`
- `generated_artifact_url`
- `generated_artifact_parent_folder_id`
- `workspace_target_file_id`
- `workspace_target_url`
- `handoff_packet_file_id`
- `handoff_packet_url`
- `drive_registry_status`
- `drive_lookup_strategy`
- `last_drive_verified_at`
- `archive_folder_id`
- `archive_status`
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
- `source_document_file_id`
- `source_document_url`
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

## Drive Safety

`.clasp.json.example` is placeholder-only. A real `.clasp.json` contains a local Apps Script project identifier, must stay local, and must not be committed.

Generated Drive artifacts must store stable file identifiers and URLs after creation. Agents must use registry identifiers after creation instead of repeated Drive name searches.

Drive registry fields are present for future use:

- `generated_artifact_file_id`
- `generated_artifact_url`
- `generated_artifact_parent_folder_id`
- `workspace_target_file_id`
- `workspace_target_url`
- `source_document_file_id`
- `source_document_url`
- `handoff_packet_file_id`
- `handoff_packet_url`
- `drive_registry_status`
- `drive_lookup_strategy`
- `last_drive_verified_at`
- `archive_folder_id`
- `archive_status`

Live Drive automation remains blocked until registry fields are approved. This MVP must not create Drive folders, move files, archive files, or search Drive repeatedly by name as an automated workflow.

## Deployment Notes

This first version is intentionally schema-first. It prepares safe Sheets-backed storage, logging, and guardrails before any live Notion or curriculum metadata sync is connected.

Before adding external sync, confirm:

- relation and lookup fields are non-editable
- Apps Script sync writes only operational metadata and Apps Script-specific logs
- Drive Operations Manager has approved file/folder ownership for generated artifacts
- Dashboard Sync Agent has approved any downstream mapping

# Curriculum Search Apps Script

GitHub-ready, clasp-compatible Google Apps Script project for `Blummer92/dmsc_apps_script_bundle` on branch `governance-compliance-search-feature`, project `search-feature-app`. It searches curriculum records across a configured Google Sheets metadata index and optional Google Drive folders while complying with Dashboard Sync Agent governance boundaries.

## Workspace Targets

- Google Sheets
- Google Drive
- Apps Script sidebar UI

## What It Does

This project adds a custom spreadsheet menu named **Search Tools**. The menu opens a sidebar where users can search curriculum records, source documents, worksheets, slide decks, dashboards, PDFs, and related metadata.

The tool is read-only. It does not update Notion, overwrite readiness status, merge duplicate records, resolve duplicates, or decide metadata ownership.

When duplicate candidates are detected, the sidebar groups them for review and shows a warning banner. Grouping is display-only and never performs a merge.

## Project Structure

```txt
search-feature-app
  src
    Code.gs
    Config.gs
    SearchService.gs
    DriveSearchService.gs
    SheetSearchService.gs
    Ui.html
    Styles.html
    Client.html
  metadata
    handoff.json
    schema-map.json
  appsscript.json
  README.md
  .claspignore
  .clasp.json.example
```

## Apps Script Functions

- `onOpen()` adds the **Search Tools** menu.
- `showSearchSidebar()` opens the curriculum search sidebar.
- `include(filename)` loads shared HTML partials.
- `getSearchBootstrap()` returns configuration status for the UI.
- `searchCurriculum(query, filters)` runs the combined search.
- `getRuntimeConfig()` reads deployment settings from `PropertiesService`.
- `getMetadataFields()` exposes the expected metadata field names.

## Services

- `CurriculumSearchService` coordinates sheet and Drive search, ranking, result limits, duplicate candidate grouping, warnings, and governance flags.
- `SheetSearchService` reads the configured metadata index with one batch read, searches normalized rows, applies configurable readiness mappings, and emits source badges.
- `DriveSearchService` searches configured Drive folders by file name and description when Drive search is enabled.

## Required Script Properties

Set these in Apps Script under **Project Settings > Script properties**.

| Property | Required | Example | Notes |
| --- | --- | --- | --- |
| `CURRICULUM_SEARCH_INDEX_SPREADSHEET_ID` | Yes | `1abc...` | Spreadsheet ID for the metadata index. |
| `CURRICULUM_SEARCH_INDEX_SHEET_NAME` | No | `Curriculum Index` | Defaults to `Curriculum Index`. |
| `CURRICULUM_SEARCH_ENABLE_DRIVE` | No | `true` | Defaults to `false`. |
| `CURRICULUM_SEARCH_DRIVE_FOLDER_IDS` | No | `folderId1,folderId2` | Comma-separated folder IDs. Required only when Drive search is enabled. |
| `CURRICULUM_SEARCH_RESULT_LIMIT` | No | `50` | Defaults to `50`. |
| `CURRICULUM_SEARCH_READINESS_VOCABULARY` | No | See below | JSON array of approved readiness values and aliases. No readiness values are hard-coded in the UI. |

### Readiness Vocabulary

Set `CURRICULUM_SEARCH_READINESS_VOCABULARY` to a JSON array approved by Dashboard Sync Agent.

Example:

```json
[
  {
    "value": "approved_status_key",
    "label": "Approved Status Label",
    "aliases": ["legacy label", "alternate spelling"]
  }
]
```

If this property is empty, the readiness filter remains a free-text field. The app still stays read-only and does not define canonical readiness values.

## Expected Sheet Headers

The metadata index should use these normalized headers:

```txt
title
unit
lesson
packet
source_document
output_type
target_dashboard
related_notion_records
readiness_status
file_url
source_system
canonical_owner_database
canonical_record_url
duplicate_resolution_status
description
updated_at
```

Header matching is forgiving: spaces and punctuation are normalized to underscores.

## clasp Setup

1. Install clasp if needed:

   ```bash
   npm install -g @google/clasp
   ```

2. Create or identify an Apps Script project.

3. Copy the example config:

   ```bash
   cp .clasp.json.example .clasp.json
   ```

4. Replace `PASTE_SCRIPT_ID_HERE` with your Apps Script project ID.

5. Push the project:

   ```bash
   clasp push
   ```

   The included `.claspignore` uploads only `appsscript.json` and files under `src`. Because the source files stay in the `src` folder, the sidebar loader references HTML files with their `src/` path.

6. Open the Apps Script editor and set the required script properties.

7. Reload the bound spreadsheet and open **Search Tools > Open Search**.

## Drive Search Configuration

Drive search is optional and off by default.

To enable it:

1. Set `CURRICULUM_SEARCH_ENABLE_DRIVE` to `true`.
2. Set `CURRICULUM_SEARCH_DRIVE_FOLDER_IDS` to a comma-separated list of Drive folder IDs.
3. Confirm the deploying account has read access to those folders.

Drive search only uses Drive file metadata. It does not parse full document bodies.

## Source Badges

Every result displays one source badge:

- `Google Sheets`
- `Google Drive`
- `Notion`
- `Dashboard`

Drive results always use `Google Drive`. Sheet-indexed records use the `source_system` column when present. If the source cannot be inferred, the app defaults the badge to `Google Sheets`.

If a sheet row contains an unrecognized `source_system`, the UI displays `Unknown Source`. Missing `source_system` values default to the adapter source, so Sheet rows default to `Google Sheets` and Drive files default to `Google Drive`.

## Governance Metadata Passthrough

Every search result includes these governance fields in `result.metadata`:

- `canonical_owner_database`
- `source_system`
- `canonical_record_url`
- `duplicate_resolution_status`
- `approved_readiness_vocabulary`
- `description`
- `file_url`

For UI compatibility, the adapters also include camelCase aliases such as `canonicalOwnerDatabase`, `canonicalRecordUrl`, `duplicateResolutionStatus`, and `approvedReadinessVocabulary`.

When `duplicate_resolution_status` is missing, adapters return `review_required`. The app does not write this default back to Sheets, Drive, Notion, or dashboards.

## Duplicate Candidate Handling

Duplicate candidates are grouped when multiple results share one of these review keys:

- `canonical_record_url`
- `file_url`
- normalized title plus unit, lesson, packet, and source document

The app checks those keys in that order. It displays a warning banner when duplicates are detected. It does not merge, delete, update, hide, or resolve any records. The response includes `duplicateCandidateGroups`, `duplicateCandidateCount`, and governance flags showing `automaticMergeEnabled: false`.

## Governance Boundary

This project touches curriculum metadata, so it includes:

- `metadata/schema-map.json`
- `metadata/handoff.json`

The project must remain read-only until Dashboard Sync Agent review confirms the approved metadata contract.

Governance fields now included:

- `canonical_owner_database`
- `source_system`
- `canonical_record_url`
- `duplicate_resolution_status`
- `approved_readiness_vocabulary`
- `github_repo`
- `github_branch`
- `governance_version`
- `review_status`
- `schema_revision`
- `last_reviewed`
- `pending_decisions`

This project does not decide:

- Notion source-of-truth ownership
- duplicate database cleanup or automatic merge
- schema merge outcomes
- readiness status ownership
- canonical metadata definitions
- final worksheet or slide generation approval

## Dashboard Sync Agent Handoff

Before adding any Notion update, write-back sync, duplicate cleanup, or readiness status update, route `metadata/handoff.json` to Dashboard Sync Agent.

Required review question:

```md
Dashboard Sync Agent, please review this Apps Script project handoff before any Notion updates occur.

Check whether the databases in scope are working together efficiently, whether any records or fields would be duplicated, and whether worksheet and slide generation agents can access canonical metadata without re-querying or redefining fields.

Please verify:
1. Which database owns each metadata field.
2. Which fields should be summary-only.
3. Whether any fields or records are duplicates.
4. Whether the generated Apps Script metadata manifest matches the source-of-truth schema.
5. Whether downstream worksheet and slide agents can safely consume this metadata.
6. What changes, if any, should be routed to the owner dashboard.
7. The approved readiness vocabulary and alias mappings.
8. The allowed duplicate resolution statuses.

Return:
- duplicate risk
- owner database
- consuming database
- safe sync path
- blocked fields
- recommended schema cleanup
- approved metadata contract
```

## Testing Notes

Manual checks:

1. Confirm `onOpen()` adds the **Search Tools** menu after reloading the spreadsheet.
2. Confirm the sidebar opens.
3. Search a known title from the metadata index.
4. Search with unit, lesson, packet, output type, and readiness filters.
5. Confirm result links open the expected files.
6. Disable or remove Drive folder properties and confirm sheet search still works.
7. Enable Drive search and confirm files appear when folder IDs are valid.
8. Add duplicate candidate rows and confirm the warning banner appears.
9. Confirm duplicate candidates are grouped but still displayed as separate records.
10. Confirm source badges display for Google Sheets, Google Drive, Notion, and Dashboard source systems.
11. Confirm no metadata records are created, merged, deleted, or updated by this project.

## Deployment Notes

Recommended deployment mode: bound spreadsheet script.

For a standalone script, keep the same script properties and bind the UI entry point to whatever launch surface the deployment uses. The current `onOpen()` menu assumes a spreadsheet container.

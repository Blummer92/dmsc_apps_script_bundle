# Curriculum Search Feature

This is a clasp-compatible Google Apps Script project for a Google Sheets sidebar search tool.

## Purpose

The script adds a custom menu named Search Tools. From that menu, users can open a sidebar and search curriculum records, source documents, worksheets, slide decks, packets, and related metadata.

Search sources:

- A configured Google Sheets metadata index
- Optional configured Google Drive folders
- Future Notion or dashboard records, only after Dashboard Sync Agent approval

The project is read-only. It does not write to Sheets, Drive, Notion, or a dashboard.

## Current governance status

Status: blocked until Dashboard Sync Agent review.

This branch implements governance-compliance updates requested after the initial review. It adds:

- canonical owner metadata
- source system metadata
- canonical record URL support
- duplicate resolution status support
- configurable readiness vocabulary
- duplicate candidate grouping without merging
- source badges in the sidebar UI
- read-only warnings and documentation

## Project structure

- src/Code.gs
- src/Config.gs
- src/SearchService.gs
- src/DriveSearchService.gs
- src/SheetSearchService.gs
- src/Ui.html
- src/Styles.html
- src/Client.html
- metadata/handoff.json
- metadata/schema-map.json
- appsscript.json
- .clasp.json.example
- .claspignore
- .gitignore

## Script properties

Set these in Apps Script Project Settings.

- CURRICULUM_SEARCH_INDEX_SPREADSHEET_ID: spreadsheet containing the curriculum index
- CURRICULUM_SEARCH_INDEX_SHEET_NAME: optional sheet tab name, defaults to Curriculum Index
- CURRICULUM_SEARCH_DRIVE_FOLDER_IDS: optional comma-separated Drive folder IDs
- CURRICULUM_SEARCH_ENABLE_DRIVE: set true to enable Drive search
- CURRICULUM_SEARCH_RESULT_LIMIT: optional positive integer result limit
- CURRICULUM_SEARCH_READINESS_VOCABULARY: optional JSON array used to configure approved readiness labels and aliases

Example readiness vocabulary:

```json
[
  {"value":"source_ready","label":"Source Ready","aliases":["ready","verified"]},
  {"value":"needs_review","label":"Needs Review","aliases":["review","draft"]},
  {"value":"blocked","label":"Blocked","aliases":["hold","issue"]}
]
```

Do not treat this example as approved vocabulary. Dashboard Sync Agent must approve final readiness mappings.

## Recommended sheet headers

Title, Unit, Lesson, Packet, Source Document, Output Type, Target Dashboard, Related Notion Records, Readiness Status, File URL, Source System, Canonical Owner Database, Canonical Record URL, Duplicate Resolution Status, Description, Updated At

The script normalizes headers to snake case internally.

## Source badges

The sidebar displays a badge for each result source:

- Google Sheets
- Google Drive
- Notion
- Dashboard
- Unknown Source

Badges are informational only. They do not imply canonical ownership.

## Duplicate handling

Duplicate candidates are grouped for review only. The app never merges, deletes, collapses, or rewrites records.

Duplicate candidate order:

1. Canonical record URL
2. File URL
3. Metadata key using title, unit, lesson, packet, and source document

When duplicate candidates are detected, the sidebar shows a warning banner. Any resolution must happen outside this read-only search surface after Dashboard Sync Agent approval.

## Setup

1. Install clasp.
2. Log in with clasp.
3. Copy .clasp.json.example to .clasp.json.
4. Add your Apps Script script ID to .clasp.json.
5. Push the project with clasp.
6. Open the bound Sheet and reload it.
7. Use Search Tools > Open Search.

## Governance boundary

This project must stay read-only until Dashboard Sync Agent reviews and approves the metadata contract. Do not add sync or write-back behavior until metadata ownership, duplicate policy, dashboard schema, readiness vocabulary, and Notion-related fields are approved.

Read-only guarantees:

- No writes to Google Sheets
- No writes to Google Drive
- No writes to Notion
- No writes to dashboards
- No automatic duplicate merge
- No readiness status updates
- No schema approval workflow inside Apps Script

Review these files before any sync work:

- metadata/handoff.json
- metadata/schema-map.json

## Notion databases in scope for review

- DM Source Library
- DM Units
- DM Curriculum Elements
- DM Source Claims / Extracted Evidence
- DM Agent Retrieval Queue
- Agent Routing Dashboard

## Dashboard Sync Agent review checklist

Before production read-only deployment, confirm:

- canonical owner database for every field
- approved readiness vocabulary and mapping source
- duplicate candidate grouping policy
- Drive search folder scope
- whether related_notion_records remains display-only
- which fields are safe for the teacher-facing sidebar

## Testing

1. Create the curriculum index sheet with the recommended headers.
2. Add sample rows with titles, units, lessons, statuses, URLs, source systems, and canonical owner values.
3. Set the spreadsheet ID script property.
4. Optional: set the readiness vocabulary property with approved JSON.
5. Push the script.
6. Open the sidebar and search for a known title or unit.
7. Confirm source badges appear.
8. Add duplicate-looking rows and confirm the duplicate warning banner appears.
9. Enable Drive search only after setting folder IDs.
10. Confirm no write behavior occurs during testing.

## Generated functions

- onOpen
- showSearchSidebar
- include
- getSearchBootstrap
- searchCurriculum
- getRuntimeConfig
- getMetadataFields

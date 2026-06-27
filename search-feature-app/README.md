# Curriculum Search Feature

This is a clasp-compatible Google Apps Script project for a Google Sheets sidebar search tool.

## Purpose

The script adds a custom menu named Search Tools. From that menu, users can open a sidebar and search curriculum records, source documents, worksheets, slide decks, packets, and related metadata.

Search sources:

- A configured Google Sheets metadata index
- Optional configured Google Drive folders

The project is read-only. It does not write to Sheets, Drive, Notion, or a dashboard.

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

## Recommended sheet headers

Title, Unit, Lesson, Packet, Source Document, Output Type, Target Dashboard, Related Notion Records, Readiness Status, File URL, Description, Updated At

## Setup

1. Install clasp.
2. Log in with clasp.
3. Copy .clasp.json.example to .clasp.json.
4. Add your Apps Script script ID to .clasp.json.
5. Push the project with clasp.
6. Open the bound Sheet and reload it.
7. Use Search Tools > Open Search.

## Governance boundary

This project should stay read-only until Dashboard Sync Agent reviews the metadata contract. Do not add sync or write-back behavior until metadata ownership, duplicate policy, dashboard schema, and Notion-related fields are approved.

Review these files before any sync work:

- metadata/handoff.json
- metadata/schema-map.json

## Testing

1. Create the curriculum index sheet with the recommended headers.
2. Add sample rows with titles, units, lessons, statuses, and URLs.
3. Set the spreadsheet ID script property.
4. Push the script.
5. Open the sidebar and search for a known title or unit.
6. Enable Drive search only after setting folder IDs.

## Generated functions

- onOpen
- showSearchSidebar
- include
- getSearchBootstrap
- searchCurriculum
- getRuntimeConfig
- getMetadataFields

# DMSC Apps Script Dashboard Test Bundle

This bundle contains the Apps Script files needed to test the Digital Media Source Control metadata dashboard.

## Files

- `Code.gs` - Backend functions, server-side filtering, pagination, audit logging, routing updates, and menu/sidebar launch.
- `Dashboard.html` - Sidebar shell.
- `DashboardCss.html` - Interface styling.
- `DashboardJs.html` - Client-side dashboard behavior.
- `appsscript.json` - Optional manifest with required scopes.

## Install

1. Open the Google Sheet connected to the image metadata workbook.
2. Go to Extensions > Apps Script.
3. Add or replace files with the files in this bundle.
4. Keep your metadata pipeline file installed too if you want the Scan Drive and Merge Metadata buttons to work.
5. Save the project.
6. Reload the spreadsheet.
7. Use the new menu: DMSC Dashboard > Open Metadata Dashboard.

## Testing checklist

1. Open the sidebar.
2. Confirm summary cards load.
3. Test queues: No Prompt Found, Duplicate Candidates, Source-Control Clearance Needed.
4. Select a record and verify inspector tabs load.
5. Update Routing Metadata on a test row.
6. Confirm a row appears in the `DMSC Audit Log` sheet.
7. Test pagination by changing rows per page.
8. Test search against filename/path/status/owner.

## Safety boundary

The dashboard is metadata-only. It does not approve assets, source-clear assets, mark images reusable, or mark images production-ready.


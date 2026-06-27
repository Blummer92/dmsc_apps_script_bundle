/**
 * Configuration for the read-only Apps Script Project Registry support layer.
 *
 * This file intentionally contains no private IDs. Set REGISTRY_SPREADSHEET_ID
 * in Script Properties before running this project.
 */
const CONFIG = Object.freeze({
  PROPERTY_KEYS: Object.freeze({
    REGISTRY_SPREADSHEET_ID: 'REGISTRY_SPREADSHEET_ID',
  }),

  SHEETS: Object.freeze({
    REGISTRY: 'Apps Script Project Registry',
  }),

  OUTPUT: Object.freeze({
    START_HERE_TITLE: 'Builder Start Here',
  }),

  FIELDS: Object.freeze({
    SCRIPT_PROJECT_NAME: 'Script Project Name',
    APPS_SCRIPT_PROJECT_ID: 'Apps Script Project ID',
    SCRIPT_URL: 'Script URL',
    DRIVE_FILE_ID: 'Drive File ID',
    GITHUB_REPOSITORY: 'GitHub Repository',
    BRANCH: 'Branch',
    BUILDER_STATUS: 'Builder Status',
    NEXT_ACTION: 'Next Action',
    BLOCKING_ISSUE: 'Blocking Issue',
  }),

  BUILDER_STATUSES: Object.freeze({
    READY: 'Ready',
    BLOCKED: 'Blocked',
  }),
});

const REQUIRED_REGISTRY_FIELDS = Object.freeze([
  CONFIG.FIELDS.SCRIPT_PROJECT_NAME,
  CONFIG.FIELDS.APPS_SCRIPT_PROJECT_ID,
  CONFIG.FIELDS.SCRIPT_URL,
  CONFIG.FIELDS.DRIVE_FILE_ID,
  CONFIG.FIELDS.GITHUB_REPOSITORY,
  CONFIG.FIELDS.BRANCH,
  CONFIG.FIELDS.BUILDER_STATUS,
  CONFIG.FIELDS.NEXT_ACTION,
]);

const OPTIONAL_REGISTRY_FIELDS = Object.freeze([
  CONFIG.FIELDS.BLOCKING_ISSUE,
]);

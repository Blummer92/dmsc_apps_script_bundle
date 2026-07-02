var APP_CONFIG = Object.freeze({
  APP_NAME: 'Digital Media Operations Console',
  MENU_NAME: 'Drive Metadata',
  SIDEBAR_TITLE: 'Digital Media Operations Console',
  DEFAULT_METADATA_SHEET_NAME: 'Drive Images',
  DEFAULT_SOURCE_LIBRARY_SHEET_NAME: 'DM Source Library',
  DEFAULT_RESULT_LIMIT: 250,
  MAX_ROWS_TO_READ: 1000,
  PROPERTIES: Object.freeze({
    DASHBOARD_SPREADSHEET_ID: 'DRIVE_METADATA_DASHBOARD_SPREADSHEET_ID',
    METADATA_SHEET_NAME: 'DRIVE_METADATA_SHEET_NAME',
    SOURCE_LIBRARY_SPREADSHEET_ID: 'DM_SOURCE_LIBRARY_SPREADSHEET_ID',
    SOURCE_LIBRARY_SHEET_NAME: 'DM_SOURCE_LIBRARY_SHEET_NAME',
    RESULT_LIMIT: 'DRIVE_METADATA_RESULT_LIMIT'
  }),
  FIELDS: Object.freeze({
    FILE_NAME: 'file_name',
    CREATED_DATE: 'created_date',
    LEVEL_1_FOLDER: 'level_1_folder',
    LEVEL_2_FOLDER: 'level_2_folder',
    LEVEL_3_FOLDER: 'level_3_folder',
    FULL_PATH: 'full_path',
    FILE_ID: 'file_id',
    DRIVE_URL: 'drive_url',
    GEMINI_GUESSED_PROMPT: 'gemini_guessed_prompt',
    OPENAI_GUESSED_PROMPT: 'openai_guessed_prompt',
    COPILOT_PROMPT_GUESS: 'copilot_prompt_guess',
    ORIGINAL_IMAGE_PROMPT: 'original_image_prompt',
    PROPOSED_CLEANED_PROMPT: 'proposed_cleaned_prompt',
    APPROVED_PROMPT: 'approved_prompt',
    REVIEW_TIER: 'review_tier',
    REVIEW_TIER_REASON: 'review_tier_reason',
    SOURCE_SYSTEM: 'source_system',
    DM_SOURCE_LIBRARY_RECORD_ID: 'dm_source_library_record_id',
    DM_SOURCE_LIBRARY_URL: 'dm_source_library_url',
    SOURCE_APPROVAL_STATUS: 'source_approval_status',
    SOURCE_APPROVAL_EVIDENCE_URL: 'source_approval_evidence_url',
    SOURCE_APPROVED_BY: 'source_approved_by',
    SOURCE_APPROVED_AT: 'source_approved_at',
    SOURCE_RESTRICTIONS: 'source_restrictions',
    ASSET_LABEL: 'asset_label',
    ASSET_CATEGORY: 'asset_category',
    UNIT_VISUAL_SYSTEM: 'unit_visual_system',
    FAST_SORT_TAGS: 'fast_sort_tags',
    VISUAL_CONSISTENCY_NOTES: 'visual_consistency_notes',
    DO_NOT_INCLUDE: 'do_not_include',
    DUPLICATE_RESOLUTION_STATUS: 'duplicate_resolution_status',
    BLOCKED_REASON: 'blocked_reason',
    AGENT_NOTES: 'agent_notes'
  })
});

function getRuntimeConfig() {
  const properties = PropertiesService.getScriptProperties();
  const configuredLimit = Number(properties.getProperty(APP_CONFIG.PROPERTIES.RESULT_LIMIT));
  const configuredDashboardId = properties.getProperty(APP_CONFIG.PROPERTIES.DASHBOARD_SPREADSHEET_ID) || '';

  return {
    dashboardSpreadsheetId: configuredDashboardId,
    useActiveDashboardSpreadsheet: !configuredDashboardId,
    metadataSheetName: properties.getProperty(APP_CONFIG.PROPERTIES.METADATA_SHEET_NAME) || APP_CONFIG.DEFAULT_METADATA_SHEET_NAME,
    sourceLibrarySpreadsheetId: properties.getProperty(APP_CONFIG.PROPERTIES.SOURCE_LIBRARY_SPREADSHEET_ID) || '',
    sourceLibrarySheetName: properties.getProperty(APP_CONFIG.PROPERTIES.SOURCE_LIBRARY_SHEET_NAME) || APP_CONFIG.DEFAULT_SOURCE_LIBRARY_SHEET_NAME,
    resultLimit: Number.isFinite(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : APP_CONFIG.DEFAULT_RESULT_LIMIT
  };
}

function getExpectedFields() {
  return Object.assign({}, APP_CONFIG.FIELDS);
}

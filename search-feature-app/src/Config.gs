const APP_CONFIG = Object.freeze({
  APP_NAME: 'Curriculum Search',
  MENU_NAME: 'Search Tools',
  SIDEBAR_TITLE: 'Curriculum Search',
  DEFAULT_RESULT_LIMIT: 50,
  MAX_DRIVE_FILES_PER_FOLDER: 100,
  PROPERTIES: Object.freeze({
    INDEX_SPREADSHEET_ID: 'CURRICULUM_SEARCH_INDEX_SPREADSHEET_ID',
    INDEX_SHEET_NAME: 'CURRICULUM_SEARCH_INDEX_SHEET_NAME',
    DRIVE_FOLDER_IDS: 'CURRICULUM_SEARCH_DRIVE_FOLDER_IDS',
    ENABLE_DRIVE_SEARCH: 'CURRICULUM_SEARCH_ENABLE_DRIVE',
    RESULT_LIMIT: 'CURRICULUM_SEARCH_RESULT_LIMIT'
  }),
  DEFAULTS: Object.freeze({
    INDEX_SHEET_NAME: 'Curriculum Index',
    ENABLE_DRIVE_SEARCH: 'false'
  }),
  FIELDS: Object.freeze({
    TITLE: 'title',
    UNIT: 'unit',
    LESSON: 'lesson',
    PACKET: 'packet',
    SOURCE_DOCUMENT: 'source_document',
    OUTPUT_TYPE: 'output_type',
    TARGET_DASHBOARD: 'target_dashboard',
    RELATED_NOTION_RECORDS: 'related_notion_records',
    READINESS_STATUS: 'readiness_status',
    FILE_URL: 'file_url',
    DESCRIPTION: 'description',
    UPDATED_AT: 'updated_at'
  })
});

function getRuntimeConfig() {
  const properties = PropertiesService.getScriptProperties();
  const configuredLimit = Number(properties.getProperty(APP_CONFIG.PROPERTIES.RESULT_LIMIT));

  return {
    indexSpreadsheetId: properties.getProperty(APP_CONFIG.PROPERTIES.INDEX_SPREADSHEET_ID) || '',
    indexSheetName: properties.getProperty(APP_CONFIG.PROPERTIES.INDEX_SHEET_NAME) || APP_CONFIG.DEFAULTS.INDEX_SHEET_NAME,
    driveFolderIds: parseCsvProperty_(properties.getProperty(APP_CONFIG.PROPERTIES.DRIVE_FOLDER_IDS)),
    enableDriveSearch: parseBooleanProperty_(
      properties.getProperty(APP_CONFIG.PROPERTIES.ENABLE_DRIVE_SEARCH),
      APP_CONFIG.DEFAULTS.ENABLE_DRIVE_SEARCH
    ),
    resultLimit: Number.isFinite(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : APP_CONFIG.DEFAULT_RESULT_LIMIT
  };
}

function getMetadataFields() {
  return Object.assign({}, APP_CONFIG.FIELDS);
}

function parseCsvProperty_(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(function(item) {
      return item.trim();
    })
    .filter(Boolean);
}

function parseBooleanProperty_(value, fallback) {
  const normalized = String(value || fallback || '').toLowerCase();
  return ['true', '1', 'yes', 'y'].indexOf(normalized) !== -1;
}

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
    RESULT_LIMIT: 'CURRICULUM_SEARCH_RESULT_LIMIT',
    READINESS_VOCABULARY: 'CURRICULUM_SEARCH_READINESS_VOCABULARY'
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
    SOURCE_SYSTEM: 'source_system',
    CANONICAL_OWNER_DATABASE: 'canonical_owner_database',
    CANONICAL_RECORD_URL: 'canonical_record_url',
    DUPLICATE_RESOLUTION_STATUS: 'duplicate_resolution_status',
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
    readinessVocabulary: parseReadinessVocabulary_(
      properties.getProperty(APP_CONFIG.PROPERTIES.READINESS_VOCABULARY)
    ),
    maxDriveFilesPerFolder: APP_CONFIG.MAX_DRIVE_FILES_PER_FOLDER,
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

function parseReadinessVocabulary_(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      console.warn('Readiness vocabulary property must be a JSON array.');
      return [];
    }

    return parsed
      .map(function(item) {
        if (typeof item === 'string') {
          return {
            value: item,
            label: item,
            aliases: []
          };
        }

        return {
          value: String(item.value || '').trim(),
          label: String(item.label || item.value || '').trim(),
          aliases: Array.isArray(item.aliases) ? item.aliases.map(String) : []
        };
      })
      .filter(function(item) {
        return item.value;
      });
  } catch (error) {
    console.error('Failed to parse readiness vocabulary property', {
      message: error.message
    });
    return [];
  }
}

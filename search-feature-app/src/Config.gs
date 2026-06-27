const CONFIG = Object.freeze({
  menuName: 'Search Tools',
  sidebarTitle: 'Curriculum Search',
  maxResults: 50,
  propertyKeys: Object.freeze({
    searchIndexSheetName: 'SEARCH_INDEX_SHEET_NAME',
    driveFolderIds: 'DRIVE_FOLDER_IDS',
    enableDriveSearch: 'ENABLE_DRIVE_SEARCH'
  }),
  defaults: Object.freeze({
    searchIndexSheetName: 'SearchIndex',
    enableDriveSearch: 'false'
  }),
  fields: Object.freeze([
    'Title',
    'Type',
    'Unit',
    'Lesson',
    'Packet',
    'Output Type',
    'Readiness Status',
    'Description',
    'Tags',
    'File URL'
  ])
});

function getRuntimeConfig() {
  const props = PropertiesService.getScriptProperties();
  const folderValue = props.getProperty(CONFIG.propertyKeys.driveFolderIds) || '';
  return {
    searchIndexSheetName: props.getProperty(CONFIG.propertyKeys.searchIndexSheetName) || CONFIG.defaults.searchIndexSheetName,
    driveFolderIds: folderValue.split(',').map(id => id.trim()).filter(Boolean),
    enableDriveSearch: String(props.getProperty(CONFIG.propertyKeys.enableDriveSearch) || CONFIG.defaults.enableDriveSearch).toLowerCase() === 'true',
    maxResults: CONFIG.maxResults
  };
}

function getMetadataFields() {
  return CONFIG.fields.slice();
}

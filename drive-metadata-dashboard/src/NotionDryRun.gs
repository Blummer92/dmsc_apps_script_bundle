const DM_NOTION_DRY_RUN_TARGET_DATA_SOURCE_ID = 'collection://bf703afb-7526-4b55-aefa-1c4976032509';

function dryRunNotionRows2To11() {
  const props = PropertiesService.getScriptProperties();

  const spreadsheetId = props.getProperty('DM_SOURCE_LIBRARY_SPREADSHEET_ID');
  const sheetName = props.getProperty('DM_SOURCE_LIBRARY_SHEET_NAME');
  const dataSourceId = props.getProperty('DM_NOTION_STAGING_DATA_SOURCE_ID');
  const databaseUrl = props.getProperty('DM_NOTION_STAGING_DATABASE_URL');

  const startRow = Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2);
  const endRow = Number(props.getProperty('DM_NOTION_SYNC_END_ROW') || 11);
  const mode = props.getProperty('DM_NOTION_SYNC_MODE') || 'DRY_RUN';

  if (mode !== 'DRY_RUN') {
    throw new Error('Blocked: this function only runs in DRY_RUN mode.');
  }

  if (startRow !== 2 || endRow !== 11) {
    throw new Error(`Blocked: row scope must be exactly rows 2-11. Got ${startRow}-${endRow}.`);
  }

  if (dataSourceId !== DM_NOTION_DRY_RUN_TARGET_DATA_SOURCE_ID) {
    throw new Error(`Blocked: wrong Notion data source target: ${dataSourceId}`);
  }

  if (!spreadsheetId || !sheetName || !databaseUrl) {
    throw new Error('Blocked: missing required dry-run script properties.');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const headerRow = 1;
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(headerRow, 1, 1, lastColumn).getValues()[0];

  const rowCount = endRow - startRow + 1;
  const rows = sheet.getRange(startRow, 1, rowCount, lastColumn).getValues();

  const headerIndex = {};
  headers.forEach((header, index) => {
    if (header) headerIndex[String(header).trim()] = index;
  });

  function getValue(row, columnName) {
    const index = headerIndex[columnName];
    return index === undefined ? '' : row[index];
  }

  const payloads = rows.map((row, offset) => {
    const sourceRow = startRow + offset;

    const fileId = getValue(row, 'file_id');
    const driveUrl = getValue(row, 'drive_url');
    const fileName = getValue(row, 'file_name');
    const pilotReviewStatus = getValue(row, 'pilot_review_status');

    if (!fileId || !driveUrl || !fileName) {
      throw new Error(`Blocked: missing file_id, drive_url, or file_name on source row ${sourceRow}`);
    }

    return {
      source_row: sourceRow,
      target_data_source_id: dataSourceId,
      target_database_url: databaseUrl,
      properties: {
        file_name: String(fileName),
        file_id: String(fileId),
        drive_url: String(driveUrl),
        prompt_status: 'Present',
        pilot_review_status: String(pilotReviewStatus || 'Approved for read-only Notion review'),
        pilot_review_scope: '10-row limited Notion payload validation only',
        pilot_review_approved_by: 'zachaey blumsrien',
        pilot_review_approval_date: '2026-06-28',
        pilot_review_notes: 'Limited staging/test metadata mapping only. Not production-ready.',
        notion_payload_validation_status: 'Validated',
        source_library_linkage_status: 'Exact File ID',
        production_source_approval_status: 'Not approved',
        generation_clearance: 'Not approved',
        test_scope: 'DM Source Library Pilot rows 2-11',
        source_row: sourceRow
      }
    };
  });

  if (payloads.length !== 10) {
    throw new Error(`Blocked: expected exactly 10 payloads, got ${payloads.length}`);
  }

  const fileIds = payloads.map(payload => payload.properties.file_id);
  const uniqueFileIds = [...new Set(fileIds)];

  if (uniqueFileIds.length !== fileIds.length) {
    throw new Error('Blocked: duplicate file_id values found in dry-run payload.');
  }

  Logger.log('DRY RUN ONLY - No Notion write executed.');
  Logger.log(`Rows selected: ${startRow}-${endRow}`);
  Logger.log(`Payload count: ${payloads.length}`);
  Logger.log(`Target data source: ${dataSourceId}`);
  Logger.log(JSON.stringify(payloads, null, 2));

  return payloads;
}

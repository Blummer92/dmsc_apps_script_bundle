var NotionSyncService = (function() {
  const TARGET_DATA_SOURCE_ID = 'collection://bf703afb-7526-4b55-aefa-1c4976032509';
  const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2022-06-28';
  const WRITE_APPROVAL_VALUE = 'YES_10_ROWS_ONLY';

  function buildRows2To11Payloads() {
    const context = getSyncContext_();
    validateReadScope_(context);

    const readResult = SheetReadService.readSpreadsheetRowsById(
      context.spreadsheetId,
      context.sheetName,
      context.startRow,
      context.endRow
    );
    if (readResult.warnings.length) {
      throw new Error('Blocked: ' + readResult.warnings.join(' '));
    }

    const payloads = readResult.records.map(function(record) {
      return buildPayloadFromRecord_(record, context);
    });

    validatePayloads_(payloads);
    return payloads;
  }

  function dryRunRows2To11() {
    const context = getSyncContext_();
    if (context.mode !== 'DRY_RUN') {
      throw new Error('Blocked: dry run only runs when DM_NOTION_SYNC_MODE is DRY_RUN.');
    }

    const payloads = buildRows2To11Payloads();
    Logger.log('DRY RUN ONLY - No Notion write executed.');
    Logger.log('Rows selected: ' + context.startRow + '-' + context.endRow);
    Logger.log('Payload count: ' + payloads.length);
    Logger.log('Target data source: ' + context.dataSourceId);
    Logger.log(JSON.stringify(payloads, null, 2));
    return payloads;
  }

  function syncRows2To11ToStaging() {
    const context = getSyncContext_();
    validateWriteScope_(context);

    const payloads = buildRows2To11Payloads();
    const databaseId = getDatabaseId_(context);
    const database = notionRequest_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
    const schema = database.properties || {};
    const synced = payloads.map(function(payload) {
      const existingPage = findExistingPageByFileId_(context, databaseId, schema, payload.properties.file_id);
      const properties = buildNotionProperties_(schema, payload.properties, context);
      const response = existingPage
        ? notionRequest_(context, 'patch', '/pages/' + encodeURIComponent(existingPage.id), { properties: properties })
        : notionRequest_(context, 'post', '/pages', { parent: { database_id: databaseId }, properties: properties });

      return {
        source_row: payload.source_row,
        file_id: payload.properties.file_id,
        action: existingPage ? 'updated' : 'created',
        page_id: response.id
      };
    });

    const verified = verifySyncedPayloads_(context, databaseId, schema, payloads);
    const result = {
      mode: context.mode,
      target_database_id: databaseId,
      target_data_source_id: context.dataSourceId,
      synced_count: synced.length,
      verified_count: verified.length,
      synced: synced,
      verified: verified
    };

    if (result.synced_count !== 10 || result.verified_count !== 10) {
      throw new Error('Blocked: expected 10 synced and verified pages. Result: ' + JSON.stringify(result));
    }

    Logger.log('STAGING WRITE COMPLETE - Not production sync.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  function getSyncContext_() {
    const props = PropertiesService.getScriptProperties();
    return {
      spreadsheetId: props.getProperty('DM_SOURCE_LIBRARY_SPREADSHEET_ID'),
      sheetName: props.getProperty('DM_SOURCE_LIBRARY_SHEET_NAME'),
      dataSourceId: props.getProperty('DM_NOTION_STAGING_DATA_SOURCE_ID'),
      databaseUrl: props.getProperty('DM_NOTION_STAGING_DATABASE_URL'),
      databaseId: props.getProperty('DM_NOTION_STAGING_DATABASE_ID'),
      notionToken: props.getProperty('DM_NOTION_API_TOKEN') || props.getProperty('NOTION_API_TOKEN'),
      titleProperty: props.getProperty('DM_NOTION_TITLE_PROPERTY') || 'file_name',
      fileIdProperty: props.getProperty('DM_NOTION_FILE_ID_PROPERTY') || 'file_id',
      writeApproval: props.getProperty('DM_NOTION_STAGING_WRITE_APPROVED'),
      startRow: Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2),
      endRow: Number(props.getProperty('DM_NOTION_SYNC_END_ROW') || 11),
      mode: props.getProperty('DM_NOTION_SYNC_MODE') || 'DRY_RUN'
    };
  }

  function validateReadScope_(context) {
    if (context.startRow !== 2 || context.endRow !== 11) {
      throw new Error('Blocked: row scope must be exactly rows 2-11. Got ' + context.startRow + '-' + context.endRow + '.');
    }
    if (context.dataSourceId !== TARGET_DATA_SOURCE_ID) {
      throw new Error('Blocked: wrong Notion data source target: ' + context.dataSourceId);
    }
    if (!context.spreadsheetId || !context.sheetName || !context.databaseUrl) {
      throw new Error('Blocked: missing required staging sync script properties.');
    }
  }

  function validateWriteScope_(context) {
    validateReadScope_(context);
    if (context.mode !== 'STAGING_WRITE') {
      throw new Error('Blocked: staging sync only runs when DM_NOTION_SYNC_MODE is STAGING_WRITE.');
    }
    if (context.writeApproval !== WRITE_APPROVAL_VALUE) {
      throw new Error('Blocked: set DM_NOTION_STAGING_WRITE_APPROVED to ' + WRITE_APPROVAL_VALUE + ' before staging write.');
    }
    if (!context.notionToken) {
      throw new Error('Blocked: missing DM_NOTION_API_TOKEN script property.');
    }
  }

  function buildPayloadFromRecord_(record, context) {
    const sourceRow = record.rowNumber;
    const fileId = record.file_id;
    const driveUrl = record.drive_url;
    const fileName = record.file_name;
    const pilotReviewStatus = record.pilot_review_status;

    if (!fileId || !driveUrl || !fileName) {
      throw new Error('Blocked: missing file_id, drive_url, or file_name on source row ' + sourceRow);
    }

    return {
      source_row: sourceRow,
      target_data_source_id: context.dataSourceId,
      target_database_url: context.databaseUrl,
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
  }

  function validatePayloads_(payloads) {
    if (payloads.length !== 10) {
      throw new Error('Blocked: expected exactly 10 payloads, got ' + payloads.length);
    }

    const fileIds = payloads.map(function(payload) { return payload.properties.file_id; });
    const uniqueFileIds = Array.from(new Set(fileIds));
    if (uniqueFileIds.length !== fileIds.length) {
      throw new Error('Blocked: duplicate file_id values found in sync payload.');
    }
  }

  function getDatabaseId_(context) {
    if (context.databaseId) {
      return normalizeNotionId_(context.databaseId);
    }

    const match = String(context.databaseUrl || '').match(/[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    if (!match) {
      throw new Error('Blocked: could not parse Notion database ID from DM_NOTION_STAGING_DATABASE_URL.');
    }
    return normalizeNotionId_(match[0]);
  }

  function normalizeNotionId_(value) {
    return String(value || '').replace(/-/g, '');
  }

  function findExistingPageByFileId_(context, databaseId, schema, fileId) {
    const fileIdProperty = schema[context.fileIdProperty];
    if (!fileIdProperty) {
      throw new Error('Blocked: Notion database is missing file ID property: ' + context.fileIdProperty);
    }

    const filter = buildEqualsFilter_(context.fileIdProperty, fileIdProperty.type, fileId);
    const result = notionRequest_(context, 'post', '/databases/' + encodeURIComponent(databaseId) + '/query', { filter: filter, page_size: 2 });
    const pages = result.results || [];
    if (pages.length > 1) {
      throw new Error('Blocked: duplicate Notion pages found for file_id ' + fileId);
    }
    return pages[0] || null;
  }

  function verifySyncedPayloads_(context, databaseId, schema, payloads) {
    return payloads.map(function(payload) {
      const page = findExistingPageByFileId_(context, databaseId, schema, payload.properties.file_id);
      if (!page) {
        throw new Error('Blocked: verification failed for file_id ' + payload.properties.file_id);
      }
      return {
        source_row: payload.source_row,
        file_id: payload.properties.file_id,
        page_id: page.id
      };
    });
  }

  function buildEqualsFilter_(propertyName, propertyType, value) {
    if (propertyType === 'title') return { property: propertyName, title: { equals: String(value) } };
    if (propertyType === 'number') return { property: propertyName, number: { equals: Number(value) } };
    if (propertyType === 'url') return { property: propertyName, url: { equals: String(value) } };
    if (propertyType === 'select') return { property: propertyName, select: { equals: String(value) } };
    if (propertyType === 'status') return { property: propertyName, status: { equals: String(value) } };
    return { property: propertyName, rich_text: { equals: String(value) } };
  }

  function buildNotionProperties_(schema, sourceProperties, context) {
    const properties = {};
    Object.keys(sourceProperties).forEach(function(name) {
      const schemaName = name === 'file_name' ? context.titleProperty : name;
      const propertySchema = schema[schemaName];
      if (!propertySchema) return;
      properties[schemaName] = formatNotionProperty_(propertySchema.type, sourceProperties[name]);
    });
    if (!properties[context.titleProperty]) {
      throw new Error('Blocked: Notion database is missing title property: ' + context.titleProperty);
    }
    if (!properties[context.fileIdProperty]) {
      throw new Error('Blocked: Notion database is missing file ID property: ' + context.fileIdProperty);
    }
    return properties;
  }

  function formatNotionProperty_(propertyType, value) {
    const stringValue = String(value || '');
    if (propertyType === 'title') return { title: [{ text: { content: stringValue } }] };
    if (propertyType === 'rich_text') return { rich_text: [{ text: { content: stringValue } }] };
    if (propertyType === 'url') return { url: stringValue || null };
    if (propertyType === 'number') return { number: Number(value) };
    if (propertyType === 'date') return { date: stringValue ? { start: stringValue } : null };
    if (propertyType === 'select') return { select: stringValue ? { name: stringValue } : null };
    if (propertyType === 'status') return { status: stringValue ? { name: stringValue } : null };
    if (propertyType === 'checkbox') return { checkbox: Boolean(value) };
    return { rich_text: [{ text: { content: stringValue } }] };
  }

  function notionRequest_(context, method, path, body) {
    const options = {
      method: method,
      muteHttpExceptions: true,
      headers: {
        Authorization: 'Bearer ' + context.notionToken,
        'Notion-Version': NOTION_VERSION
      }
    };
    if (body) {
      options.contentType = 'application/json';
      options.payload = JSON.stringify(body);
    }

    const response = UrlFetchApp.fetch(NOTION_API_BASE_URL + path, options);
    const status = response.getResponseCode();
    const text = response.getContentText();
    const parsed = text ? JSON.parse(text) : {};
    if (status < 200 || status >= 300) {
      throw new Error('Notion API error ' + status + ': ' + text);
    }
    return parsed;
  }

  return {
    buildRows2To11Payloads: buildRows2To11Payloads,
    dryRunRows2To11: dryRunRows2To11,
    syncRows2To11ToStaging: syncRows2To11ToStaging
  };
})();

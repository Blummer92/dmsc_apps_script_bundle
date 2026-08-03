var CanonicalOwnershipNotionSyncService = (function() {
  const STAGING_DATA_SOURCE_ID = 'collection://bf703afb-7526-4b55-aefa-1c4976032509';
  const NOTION_API_BASE_URL = 'https://api.notion.com/v1';
  const NOTION_VERSION = '2022-06-28';
  const TEN_ROW_SCOPE = 'TEN_ROW_APPROVAL';
  const EXPANDED_SCOPE = 'ELIGIBLE_STAGING_BATCH';
  const TEN_ROW_WRITE_APPROVAL_VALUE = 'YES_10_ROWS_ONLY';
  const EXPANDED_WRITE_APPROVAL_VALUE = 'YES_EXPANDED_STAGING_BATCH_ONLY';
  const DEFAULT_BATCH_SIZE = 25;
  const MAX_BATCH_SIZE = 50;
  const DEFAULT_MAX_END_ROW = 454;
  const REQUEST_DELAY_MS = 350;

  const DENIED_AUTHORITY_FIELDS = [
    'classification',
    'source_authority',
    'source_authority_level',
    'source_approval_status',
    'source_approval_lookup',
    'safe_use_permissions',
    'production_boundary',
    'student_facing_readiness',
    'use_now_gate',
    'unit_readiness',
    'production_authorized',
    'production_authorization',
    'production_source_approval_status',
    'generation_clearance',
    'pilot_review_status'
  ];

  const TECHNICAL_FIELDS = [
    'file_name',
    'file_id',
    'drive_url',
    'prompt_status',
    'pilot_review_scope',
    'pilot_review_approved_by',
    'pilot_review_approval_date',
    'pilot_review_notes',
    'notion_payload_validation_status',
    'source_library_linkage_status',
    'sync_eligibility',
    'test_scope',
    'staging_sync_scope',
    'source_row',
    'canonical_source_id',
    'canonical_source_url',
    'canonical_unit_id',
    'canonical_unit_url',
    'legacy_unit_name'
  ];

  function dryRunRows2To11() {
    const context = getContext_();
    validateBaseContext_(context);
    validateTenRowScope_(context);
    if (context.mode !== 'DRY_RUN') {
      throw new Error('Blocked: canonical ownership dry run requires DM_NOTION_SYNC_MODE=DRY_RUN.');
    }
    const batch = buildBatch_(context, 2, 11, false, 'DM Source Library Pilot rows 2-11');
    validateExpectedCount_(batch.payloads, 10);
    return buildSummary_(context, batch, []);
  }

  function syncRows2To11ToStaging() {
    const context = getContext_();
    validateBaseContext_(context);
    validateTenRowScope_(context);
    validateWriteContext_(context, TEN_ROW_WRITE_APPROVAL_VALUE, context.tenRowApproval);
    const batch = buildBatch_(context, 2, 11, false, 'DM Source Library Pilot rows 2-11');
    validateExpectedCount_(batch.payloads, 10);
    return syncBatch_(context, batch);
  }

  function dryRunEligibleStagingBatch() {
    const context = getContext_();
    validateBaseContext_(context);
    validateExpandedScope_(context);
    if (context.mode !== 'DRY_RUN') {
      throw new Error('Blocked: canonical ownership dry run requires DM_NOTION_SYNC_MODE=DRY_RUN.');
    }
    const endRow = Math.min(context.endRow, context.cursorRow + context.batchSize - 1);
    const batch = buildBatch_(context, context.cursorRow, endRow, true, 'Eligible staging batch rows ' + context.cursorRow + '-' + endRow);
    batch.next_cursor_row = endRow < context.endRow ? endRow + 1 : null;
    return buildSummary_(context, batch, []);
  }

  function syncEligibleStagingBatchToStaging() {
    const context = getContext_();
    validateBaseContext_(context);
    validateExpandedScope_(context);
    validateWriteContext_(context, EXPANDED_WRITE_APPROVAL_VALUE, context.expandedApproval);
    const endRow = Math.min(context.endRow, context.cursorRow + context.batchSize - 1);
    const batch = buildBatch_(context, context.cursorRow, endRow, true, 'Eligible staging batch rows ' + context.cursorRow + '-' + endRow);
    batch.next_cursor_row = endRow < context.endRow ? endRow + 1 : null;
    return syncBatch_(context, batch);
  }

  function buildBatch_(context, startRow, endRow, requireEligible, testScope) {
    assertSafeFieldMappings_(context.fieldMappings);
    const read = SheetReadService.readSpreadsheetRowsById(context.spreadsheetId, context.sheetName, startRow, endRow);
    if (read.warnings.length) throw new Error('Blocked: ' + read.warnings.join(' '));

    const skipped = [];
    const payloads = [];
    read.records.forEach(function(record) {
      const eligibility = evaluateEligibility_(record);
      if (requireEligible && !eligibility.eligible) {
        skipped.push({ source_row: record.rowNumber, file_id: record.file_id || '', reason: eligibility.reason });
        return;
      }
      payloads.push(buildPayload_(record, context, testScope, eligibility));
    });

    return {
      payloads: payloads,
      skipped: skipped,
      read_count: read.records.length,
      batch_start_row: startRow,
      batch_end_row: endRow,
      next_cursor_row: null
    };
  }

  function buildPayload_(record, context, testScope, eligibility) {
    const fileId = clean_(record.file_id);
    const driveUrl = clean_(record.drive_url);
    const fileName = clean_(record.file_name);
    if (!fileId || !driveUrl || !fileName) {
      throw new Error('Blocked: missing file_id, drive_url, or file_name on source row ' + record.rowNumber + '.');
    }

    const canonicalSourceId = first_(record.canonical_source_id, record.dm_source_library_record_id, record.canonical_source_record_id);
    const canonicalSourceUrl = first_(record.canonical_source_url, record.dm_source_library_url, record.canonical_source_record_url);
    const canonicalUnitId = first_(record.canonical_unit_id, record.canonical_unit_record_id);
    const canonicalUnitUrl = first_(record.canonical_unit_url, record.canonical_unit_record_url);
    const legacyUnitName = first_(record.unit_name, record.unit, record.unit_visual_system);

    const properties = {
      file_name: fileName,
      file_id: fileId,
      drive_url: driveUrl,
      prompt_status: 'Present',
      pilot_review_scope: 'Technical metadata validation only',
      pilot_review_approved_by: 'system migration',
      pilot_review_approval_date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      pilot_review_notes: 'Technical staging metadata only. This payload does not grant source authority, curriculum readiness, or production authorization.',
      notion_payload_validation_status: 'Validated',
      source_library_linkage_status: canonicalSourceId ? 'Canonical relation available' : 'Needs canonical source review',
      sync_eligibility: eligibility.syncStatus,
      test_scope: testScope,
      staging_sync_scope: context.syncScope,
      source_row: record.rowNumber,
      canonical_source_id: canonicalSourceId,
      canonical_source_url: canonicalSourceUrl,
      canonical_unit_id: canonicalUnitId,
      canonical_unit_url: canonicalUnitUrl,
      legacy_unit_name: legacyUnitName
    };

    return {
      source_row: record.rowNumber,
      target_data_source_id: context.dataSourceId,
      target_database_url: context.databaseUrl,
      properties: properties
    };
  }

  function syncBatch_(context, batch) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) throw new Error('Blocked: another canonical ownership sync is already running.');
    try {
      const databaseId = getDatabaseId_(context);
      const database = request_(context, 'get', '/databases/' + encodeURIComponent(databaseId));
      const schema = database.properties || {};
      const synced = [];
      const warnings = [];

      batch.payloads.forEach(function(payload) {
        const plan = buildPropertyPlan_(schema, payload.properties, context);
        Array.prototype.push.apply(warnings, plan.warnings.map(function(item) {
          return Object.assign({ source_row: payload.source_row, file_id: payload.properties.file_id }, item);
        }));
        const existing = findByFileId_(context, databaseId, schema, payload.properties.file_id);
        const response = existing
          ? request_(context, 'patch', '/pages/' + encodeURIComponent(existing.id), { properties: plan.properties })
          : request_(context, 'post', '/pages', { parent: { database_id: databaseId }, properties: plan.properties });
        synced.push({
          source_row: payload.source_row,
          file_id: payload.properties.file_id,
          action: existing ? 'updated' : 'created',
          page_id: response.id,
          page_url: response.url || buildPageUrl_(response.id)
        });
      });

      const result = buildSummary_(context, batch, synced);
      result.verified_count = synced.length;
      result.mapping_warnings = warnings;
      return result;
    } finally {
      lock.releaseLock();
    }
  }

  function buildPropertyPlan_(schema, sourceProperties, context) {
    const properties = {};
    const warnings = [];

    Object.keys(sourceProperties).forEach(function(sourceName) {
      const normalizedSource = normalize_(sourceName);
      if (DENIED_AUTHORITY_FIELDS.indexOf(normalizedSource) !== -1) {
        throw new Error('Blocked authority-bearing field in Drive Metadata sync payload: ' + sourceName);
      }
      if (TECHNICAL_FIELDS.indexOf(sourceName) === -1) {
        throw new Error('Blocked non-technical field in Drive Metadata sync payload: ' + sourceName);
      }

      if (sourceName === 'canonical_source_id') {
        const relationSchema = schema['Canonical Source'];
        if (!sourceProperties[sourceName]) return;
        if (!relationSchema || relationSchema.type !== 'relation') {
          warnings.push({ field_name: 'Canonical Source', reason: 'Canonical Source relation is missing from the target schema.' });
          return;
        }
        properties['Canonical Source'] = { relation: [{ id: normalizeNotionId_(sourceProperties[sourceName]) }] };
        return;
      }

      if (sourceName === 'canonical_unit_id') {
        const relationSchema = schema['Canonical Unit'];
        if (!sourceProperties[sourceName]) return;
        if (!relationSchema || relationSchema.type !== 'relation') {
          warnings.push({ field_name: 'Canonical Unit', reason: 'Canonical Unit relation is not available; canonical unit remains a read-path summary.' });
          return;
        }
        properties['Canonical Unit'] = { relation: [{ id: normalizeNotionId_(sourceProperties[sourceName]) }] };
        return;
      }

      const targetName = mappedName_(sourceName, context);
      if (!schema[targetName]) return;
      if (DENIED_AUTHORITY_FIELDS.indexOf(normalize_(targetName)) !== -1) {
        throw new Error('Blocked mapping to authority-bearing Notion property: ' + targetName);
      }
      const value = sourceProperties[sourceName];
      if (value === '' || value === null || value === undefined) return;
      properties[targetName] = formatProperty_(schema[targetName], value);
    });

    if (!properties[context.titleProperty]) throw new Error('Blocked: missing writable title property ' + context.titleProperty + '.');
    if (!properties[context.fileIdProperty]) throw new Error('Blocked: missing writable file ID property ' + context.fileIdProperty + '.');
    return { properties: properties, warnings: warnings };
  }

  function assertSafeFieldMappings_(mappings) {
    Object.keys(mappings || {}).forEach(function(sourceName) {
      const targetName = String(mappings[sourceName] || '');
      if (DENIED_AUTHORITY_FIELDS.indexOf(normalize_(sourceName)) !== -1 || DENIED_AUTHORITY_FIELDS.indexOf(normalize_(targetName)) !== -1) {
        throw new Error('Blocked DM_NOTION_FIELD_MAPPINGS authority mapping: ' + sourceName + ' -> ' + targetName);
      }
    });
  }

  function mappedName_(sourceName, context) {
    if (sourceName === 'file_name') return context.titleProperty;
    if (sourceName === 'file_id') return context.fileIdProperty;
    if (sourceName === 'drive_url') return context.driveUrlProperty;
    return context.fieldMappings[sourceName] ? String(context.fieldMappings[sourceName]) : sourceName;
  }

  function evaluateEligibility_(record) {
    if (!clean_(record.file_id) || !clean_(record.drive_url) || !clean_(record.file_name)) {
      return { eligible: false, reason: 'missing file identity', syncStatus: 'Blocked' };
    }
    if (isTruthy_(record.do_not_include) || clean_(record.blocked_reason) || normalize_(record.review_tier) === 'tier_4') {
      return { eligible: false, reason: 'record is technically blocked', syncStatus: 'Blocked' };
    }
    const canonicalSourceId = first_(record.canonical_source_id, record.dm_source_library_record_id, record.canonical_source_record_id);
    if (!canonicalSourceId) {
      return { eligible: true, reason: 'canonical source relation needs review', syncStatus: 'Needs review' };
    }
    return { eligible: true, reason: '', syncStatus: 'Eligible for sync' };
  }

  function getContext_() {
    const props = PropertiesService.getScriptProperties();
    const startRow = Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2);
    return {
      spreadsheetId: props.getProperty('DM_SOURCE_LIBRARY_SPREADSHEET_ID'),
      sheetName: props.getProperty('DM_SOURCE_LIBRARY_SHEET_NAME'),
      dataSourceId: props.getProperty('DM_NOTION_STAGING_DATA_SOURCE_ID'),
      databaseUrl: props.getProperty('DM_NOTION_STAGING_DATABASE_URL'),
      databaseId: props.getProperty('DM_NOTION_STAGING_DATABASE_ID'),
      notionToken: props.getProperty('DM_NOTION_API_TOKEN') || props.getProperty('NOTION_API_TOKEN'),
      titleProperty: props.getProperty('DM_NOTION_TITLE_PROPERTY') || 'file_name',
      fileIdProperty: props.getProperty('DM_NOTION_FILE_ID_PROPERTY') || 'file_id',
      driveUrlProperty: props.getProperty('DM_NOTION_DRIVE_URL_PROPERTY') || 'drive_url',
      fieldMappings: parseMappings_(props.getProperty('DM_NOTION_FIELD_MAPPINGS')),
      syncScope: props.getProperty('DM_NOTION_SYNC_SCOPE') || TEN_ROW_SCOPE,
      mode: props.getProperty('DM_NOTION_SYNC_MODE') || 'DRY_RUN',
      tenRowApproval: props.getProperty('DM_NOTION_STAGING_WRITE_APPROVED'),
      expandedApproval: props.getProperty('DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED'),
      startRow: startRow,
      endRow: Number(props.getProperty('DM_NOTION_SYNC_END_ROW') || 11),
      cursorRow: Number(props.getProperty('DM_NOTION_SYNC_CURSOR_ROW') || startRow),
      batchSize: Number(props.getProperty('DM_NOTION_SYNC_BATCH_SIZE') || DEFAULT_BATCH_SIZE),
      maxEndRow: Number(props.getProperty('DM_NOTION_SYNC_MAX_END_ROW') || DEFAULT_MAX_END_ROW)
    };
  }

  function validateBaseContext_(context) {
    if (context.dataSourceId !== STAGING_DATA_SOURCE_ID) {
      throw new Error('Blocked: canonical ownership sync only targets the Drive Metadata staging data source.');
    }
    if (!context.spreadsheetId || !context.sheetName || !context.databaseUrl) {
      throw new Error('Blocked: missing required source spreadsheet or Notion staging configuration.');
    }
  }

  function validateTenRowScope_(context) {
    if (context.syncScope !== TEN_ROW_SCOPE || context.startRow !== 2 || context.endRow !== 11) {
      throw new Error('Blocked: ten-row lane must use TEN_ROW_APPROVAL and rows 2-11.');
    }
  }

  function validateExpandedScope_(context) {
    if (context.syncScope !== EXPANDED_SCOPE) throw new Error('Blocked: expanded lane requires ELIGIBLE_STAGING_BATCH.');
    if (context.startRow < 2 || context.endRow < context.startRow || context.endRow > context.maxEndRow) {
      throw new Error('Blocked: invalid expanded row range.');
    }
    if (context.cursorRow < context.startRow || context.cursorRow > context.endRow) throw new Error('Blocked: cursor is outside the expanded row range.');
    if (!Number.isFinite(context.batchSize) || context.batchSize < 1 || context.batchSize > MAX_BATCH_SIZE) throw new Error('Blocked: batch size must be 1-' + MAX_BATCH_SIZE + '.');
  }

  function validateWriteContext_(context, requiredValue, actualValue) {
    if (context.mode !== 'STAGING_WRITE') throw new Error('Blocked: write requires DM_NOTION_SYNC_MODE=STAGING_WRITE.');
    if (actualValue !== requiredValue) throw new Error('Blocked: missing explicit staging write approval.');
    if (!context.notionToken) throw new Error('Blocked: missing Notion API token.');
  }

  function findByFileId_(context, databaseId, schema, fileId) {
    const property = schema[context.fileIdProperty];
    if (!property) throw new Error('Blocked: target is missing file ID property ' + context.fileIdProperty + '.');
    const body = { filter: buildEqualsFilter_(context.fileIdProperty, property.type, fileId), page_size: 2 };
    const result = request_(context, 'post', '/databases/' + encodeURIComponent(databaseId) + '/query', body);
    if ((result.results || []).length > 1) throw new Error('Blocked: duplicate Notion pages found for file_id ' + fileId + '.');
    return (result.results || [])[0] || null;
  }

  function buildEqualsFilter_(name, type, value) {
    if (type === 'title') return { property: name, title: { equals: String(value) } };
    if (type === 'url') return { property: name, url: { equals: String(value) } };
    if (type === 'select') return { property: name, select: { equals: String(value) } };
    if (type === 'status') return { property: name, status: { equals: String(value) } };
    if (type === 'number') return { property: name, number: { equals: Number(value) } };
    return { property: name, rich_text: { equals: String(value) } };
  }

  function formatProperty_(schema, value) {
    const type = schema.type;
    const text = String(value || '');
    if (type === 'title') return { title: [{ text: { content: text } }] };
    if (type === 'rich_text') return { rich_text: [{ text: { content: text } }] };
    if (type === 'url') return { url: text || null };
    if (type === 'number') return { number: Number(value) };
    if (type === 'select') return { select: text ? { name: text } : null };
    if (type === 'status') return { status: text ? { name: text } : null };
    if (type === 'checkbox') return { checkbox: isTruthy_(value) };
    if (type === 'date') return { date: text ? { start: text } : null };
    throw new Error('Blocked: unsupported Notion property type for technical sync: ' + type + '.');
  }

  function request_(context, method, path, body) {
    const options = {
      method: method,
      muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + context.notionToken, 'Notion-Version': NOTION_VERSION }
    };
    if (body) {
      options.contentType = 'application/json';
      options.payload = JSON.stringify(body);
    }
    const response = UrlFetchApp.fetch(NOTION_API_BASE_URL + path, options);
    if (typeof Utilities !== 'undefined' && Utilities.sleep) Utilities.sleep(REQUEST_DELAY_MS);
    const status = response.getResponseCode();
    const text = response.getContentText();
    const parsed = text ? JSON.parse(text) : {};
    if (status < 200 || status >= 300) throw new Error('Notion API error ' + status + ': ' + text);
    return parsed;
  }

  function getDatabaseId_(context) {
    if (context.databaseId) return normalizeNotionId_(context.databaseId);
    const match = String(context.databaseUrl || '').match(/[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
    if (!match) throw new Error('Blocked: could not parse Notion database ID.');
    return normalizeNotionId_(match[0]);
  }

  function parseMappings_(raw) {
    if (!raw || !String(raw).trim()) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Blocked: DM_NOTION_FIELD_MAPPINGS must be a JSON object.');
    return parsed;
  }

  function buildSummary_(context, batch, synced) {
    return {
      mode: context.mode,
      sync_scope: context.syncScope,
      target_data_source_id: context.dataSourceId,
      batch_start_row: batch.batch_start_row,
      batch_end_row: batch.batch_end_row,
      next_cursor_row: batch.next_cursor_row,
      read_count: batch.read_count,
      eligible_payload_count: batch.payloads.length,
      skipped_count: batch.skipped.length,
      skipped: batch.skipped,
      synced_count: (synced || []).length,
      verified_count: 0,
      synced: synced || [],
      payloads: context.mode === 'DRY_RUN' ? batch.payloads : []
    };
  }

  function validateExpectedCount_(payloads, expected) {
    if (payloads.length !== expected) throw new Error('Blocked: expected ' + expected + ' payloads, got ' + payloads.length + '.');
  }

  function first_() {
    for (let i = 0; i < arguments.length; i += 1) {
      const value = clean_(arguments[i]);
      if (value) return value;
    }
    return '';
  }

  function clean_(value) { return String(value || '').trim(); }
  function normalize_(value) { return clean_(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
  function normalizeNotionId_(value) { return clean_(value).replace(/-/g, ''); }
  function isTruthy_(value) { return ['true', 'yes', 'y', '1', 'eligible', 'approved'].indexOf(normalize_(value)) !== -1; }
  function buildPageUrl_(id) { const cleanId = normalizeNotionId_(id); return cleanId ? 'https://www.notion.so/' + cleanId : ''; }

  return {
    dryRunRows2To11: dryRunRows2To11,
    syncRows2To11ToStaging: syncRows2To11ToStaging,
    dryRunEligibleStagingBatch: dryRunEligibleStagingBatch,
    syncEligibleStagingBatchToStaging: syncEligibleStagingBatchToStaging,
    deniedAuthorityFields: DENIED_AUTHORITY_FIELDS.slice()
  };
})();
/**
 * Source-approved visual asset Notion sync.
 *
 * This sync uses only deterministic identifiers:
 * 1. Sheet Drive File ID -> Notion file_id
 * 2. Google Drive ID extracted from Sheet source link -> Notion source link
 *
 * It skips incomplete rows, ambiguous matches, and filename-only matches.
 */

const VAM_SOURCE_NOTION_SYNC_CONFIG = {
  NOTION_DATABASE_ID: 'PASTE_NOTION_VISUAL_ASSET_LIBRARY_DATABASE_ID',
  NOTION_DATABASE_ID_PROPERTY_KEY: 'VAM_NOTION_VISUAL_ASSET_LIBRARY_DATABASE_ID',
  NOTION_TOKEN_PROPERTY_KEY: 'NOTION_TOKEN',
  ENABLE_WRITES_PROPERTY_KEY: 'VAM_NOTION_SYNC_ENABLE_WRITES',
  NOTION_VERSION: '2022-06-28',
  PAGE_SIZE: 100,
  MATCH_PROPERTIES: {
    fileId: 'file_id',
    sourceFileLink: 'Source file link'
  },
  UPDATE_PROPERTIES: {
    assetId: 'Asset ID',
    fileId: 'file_id',
    sourceFileLink: 'Source file link',
    sourceApprovalStatus: 'Source Approval Status',
    sourceAuthorityNotes: 'Source Authority Notes'
  }
};

function setSourceApprovedNotionSyncConfig(notionDatabaseId, notionToken) {
  const props = PropertiesService.getScriptProperties();
  const databaseId = String(notionDatabaseId || '').trim();
  const token = String(notionToken || '').trim();
  if (!databaseId) {
    throw new Error('Provide a non-empty Notion database ID.');
  }
  if (!token) {
    throw new Error('Provide a non-empty Notion token.');
  }

  props.setProperty(VAM_SOURCE_NOTION_SYNC_CONFIG.NOTION_DATABASE_ID_PROPERTY_KEY, databaseId);
  props.setProperty(VAM_SOURCE_NOTION_SYNC_CONFIG.NOTION_TOKEN_PROPERTY_KEY, token);
  Logger.log('Saved Notion sync database ID and token in Script Properties.');
}

function enableSourceApprovedNotionWrites() {
  PropertiesService.getScriptProperties()
    .setProperty(VAM_SOURCE_NOTION_SYNC_CONFIG.ENABLE_WRITES_PROPERTY_KEY, 'YES');
  Logger.log('Notion writes enabled for source-approved asset sync.');
}

function disableSourceApprovedNotionWrites() {
  PropertiesService.getScriptProperties()
    .deleteProperty(VAM_SOURCE_NOTION_SYNC_CONFIG.ENABLE_WRITES_PROPERTY_KEY);
  Logger.log('Notion writes disabled for source-approved asset sync.');
}

function previewSourceApprovedNotionSync() {
  return runSourceApprovedNotionSync_({ dryRun: true });
}

function runSourceApprovedNotionSyncDryRun() {
  return runSourceApprovedNotionSync_({ dryRun: true });
}

function runSourceApprovedNotionSync() {
  if (!sourceApprovedNotionWritesEnabled_()) {
    throw new Error(
      'Notion writes are disabled. Run enableSourceApprovedNotionWrites() first, ' +
      'or use previewSourceApprovedNotionSync() for a dry run.'
    );
  }
  return runSourceApprovedNotionSync_({ dryRun: false });
}

function runSourceApprovedNotionSync_(options) {
  const dryRun = options.dryRun !== false;
  const audit = runSourceApprovedVisualAssetAudit();
  const schema = readSourceApprovedNotionDatabaseSchema_();
  const pages = readAllSourceApprovedNotionPages_();
  const index = buildSourceApprovedNotionIndex_(pages);
  const syncRows = audit.rows.map(function(asset) {
    return buildSourceApprovedNotionSyncRow_(asset, index, schema, dryRun);
  });

  if (!dryRun) {
    syncRows.forEach(function(row) {
      if (row.action !== 'Update') {
        return;
      }
      updateSourceApprovedNotionPage_(row.notionPageId, row.patch);
    });
  }

  const summary = buildSourceApprovedNotionSyncSummary_(audit.rows, pages, syncRows, dryRun);
  const csv = sourceAuditToCsv_(syncRows.map(toSourceApprovedNotionSyncCsvRow_), sourceApprovedNotionSyncHeaders_());
  const summaryCsv = sourceAuditToCsv_(sourceApprovedNotionSyncSummaryRows_(summary), ['Metric', 'Value']);

  Logger.log('Source-approved Notion sync summary\n%s', summaryCsv);
  Logger.log('Source-approved Notion sync rows\n%s', csv);

  return {
    dryRun: dryRun,
    summary: summary,
    summaryCsv: summaryCsv,
    rows: syncRows,
    csv: csv
  };
}

function buildSourceApprovedNotionSyncRow_(asset, index, schema, dryRun) {
  const missing = sourceApprovedNotionMissingSyncFields_(asset);
  if (missing.length) {
    return sourceApprovedNotionSkipRow_(asset, 'Skip', 'Missing required field(s): ' + missing.join(', '));
  }

  const match = findSourceApprovedNotionMatch_(asset, index);
  if (!match.page) {
    return sourceApprovedNotionSkipRow_(asset, 'Skip', match.reason);
  }

  const patch = buildSourceApprovedNotionPatch_(asset, match.page, schema);
  const changedProperties = Object.keys(patch.properties);
  if (!changedProperties.length) {
    return {
      asset: asset,
      notionPageId: match.page.pageId,
      matchMethod: match.method,
      action: 'No changes',
      reason: '',
      changedProperties: [],
      patch: patch
    };
  }

  return {
    asset: asset,
    notionPageId: match.page.pageId,
    matchMethod: match.method,
    action: dryRun ? 'Would update' : 'Update',
    reason: '',
    changedProperties: changedProperties,
    patch: patch
  };
}

function sourceApprovedNotionMissingSyncFields_(asset) {
  const missing = [];
  if (!asset['Asset ID']) {
    missing.push('Asset ID');
  }
  if (!asset['Drive File ID']) {
    missing.push('Drive File ID');
  }
  if (!isSourceAuditUsableUrl_(asset['Source file link'])) {
    missing.push('Source file link');
  }
  return missing;
}

function findSourceApprovedNotionMatch_(asset, index) {
  const driveFileId = asset['Drive File ID'];
  const sourceLinkDriveFileId = extractSourceApprovedGoogleDriveFileId_(asset['Source file link']);

  const fileIdCandidates = index.byFileId[driveFileId] || [];
  if (fileIdCandidates.length === 1) {
    return { page: fileIdCandidates[0], method: 'file_id', reason: '' };
  }
  if (fileIdCandidates.length > 1) {
    return { page: null, method: '', reason: 'Ambiguous Notion file_id match: ' + driveFileId };
  }

  const sourceLinkCandidates = index.bySourceLinkDriveFileId[sourceLinkDriveFileId] || [];
  if (sourceLinkCandidates.length === 1) {
    return { page: sourceLinkCandidates[0], method: 'Source file link Google Drive ID', reason: '' };
  }
  if (sourceLinkCandidates.length > 1) {
    return { page: null, method: '', reason: 'Ambiguous Notion Source file link match: ' + sourceLinkDriveFileId };
  }

  return { page: null, method: '', reason: 'No Notion page matched by file_id or Source file link Google Drive ID' };
}

function buildSourceApprovedNotionPatch_(asset, page, schema) {
  const patch = { properties: {} };
  addSourceApprovedNotionPatchProperty_(patch, schema, page, 'assetId', asset['Asset ID']);
  addSourceApprovedNotionPatchProperty_(patch, schema, page, 'fileId', asset['Drive File ID']);
  addSourceApprovedNotionPatchProperty_(patch, schema, page, 'sourceFileLink', asset['Source file link']);
  addSourceApprovedNotionPatchProperty_(patch, schema, page, 'sourceApprovalStatus', asset['Source Approval Status']);
  addSourceApprovedNotionPatchProperty_(patch, schema, page, 'sourceAuthorityNotes', asset['Source Authority Notes']);
  return patch;
}

function addSourceApprovedNotionPatchProperty_(patch, schema, page, configKey, value) {
  const propertyName = VAM_SOURCE_NOTION_SYNC_CONFIG.UPDATE_PROPERTIES[configKey];
  if (!propertyName || !schema[propertyName]) {
    return;
  }

  const normalizedValue = String(value || '').trim();
  const currentValue = String(page.values[propertyName] || '').trim();
  if (normalizedValue === currentValue) {
    return;
  }

  const notionValue = sourceApprovedNotionPropertyPayload_(schema[propertyName].type, normalizedValue);
  if (notionValue === null) {
    return;
  }
  patch.properties[propertyName] = notionValue;
}

function sourceApprovedNotionPropertyPayload_(type, value) {
  switch (type) {
    case 'title':
      return { title: value ? [{ text: { content: value } }] : [] };
    case 'rich_text':
      return { rich_text: value ? [{ text: { content: value } }] : [] };
    case 'url':
      return { url: value || null };
    case 'select':
      return value ? { select: { name: value } } : { select: null };
    case 'status':
      return value ? { status: { name: value } } : { status: null };
    case 'email':
      return { email: value || null };
    case 'phone_number':
      return { phone_number: value || null };
    case 'multi_select':
      return { multi_select: value ? value.split(',').map(function(item) {
        return { name: item.trim() };
      }).filter(function(item) {
        return item.name;
      }) : [] };
    default:
      return null;
  }
}

function readSourceApprovedNotionDatabaseSchema_() {
  const database = sourceApprovedNotionFetchJson_(
    'https://api.notion.com/v1/databases/' + encodeURIComponent(getSourceApprovedNotionDatabaseId_()),
    { method: 'get' }
  );
  const schema = {};
  Object.keys(database.properties || {}).forEach(function(name) {
    schema[name] = {
      name: name,
      type: database.properties[name].type
    };
  });
  return schema;
}

function readAllSourceApprovedNotionPages_() {
  const pages = [];
  let cursor = null;
  do {
    const body = {
      page_size: VAM_SOURCE_NOTION_SYNC_CONFIG.PAGE_SIZE
    };
    if (cursor) {
      body.start_cursor = cursor;
    }

    const parsed = sourceApprovedNotionFetchJson_(
      'https://api.notion.com/v1/databases/' + encodeURIComponent(getSourceApprovedNotionDatabaseId_()) + '/query',
      {
        method: 'post',
        payload: JSON.stringify(body)
      }
    );

    (parsed.results || []).forEach(function(page) {
      pages.push(toSourceApprovedNotionPage_(page));
    });
    cursor = parsed.has_more ? parsed.next_cursor : null;
  } while (cursor);

  return pages;
}

function toSourceApprovedNotionPage_(page) {
  const values = {};
  Object.keys(page.properties || {}).forEach(function(name) {
    values[name] = sourceApprovedNotionPropertyValue_(page.properties[name]);
  });

  const fileId = values[VAM_SOURCE_NOTION_SYNC_CONFIG.MATCH_PROPERTIES.fileId] || '';
  const sourceFileLink = values[VAM_SOURCE_NOTION_SYNC_CONFIG.MATCH_PROPERTIES.sourceFileLink] || '';

  return {
    pageId: page.id,
    values: values,
    fileId: normalizeSourceAuditDriveFileId_(fileId),
    sourceFileLink: sourceFileLink,
    sourceLinkDriveFileId: extractSourceApprovedGoogleDriveFileId_(sourceFileLink)
  };
}

function buildSourceApprovedNotionIndex_(pages) {
  const byFileId = {};
  const bySourceLinkDriveFileId = {};
  pages.forEach(function(page) {
    addSourceApprovedNotionIndex_(byFileId, page.fileId, page);
    addSourceApprovedNotionIndex_(bySourceLinkDriveFileId, page.sourceLinkDriveFileId, page);
  });
  return {
    byFileId: byFileId,
    bySourceLinkDriveFileId: bySourceLinkDriveFileId
  };
}

function addSourceApprovedNotionIndex_(index, key, page) {
  if (!key) {
    return;
  }
  if (!index[key]) {
    index[key] = [];
  }
  index[key].push(page);
}

function updateSourceApprovedNotionPage_(pageId, patch) {
  sourceApprovedNotionFetchJson_(
    'https://api.notion.com/v1/pages/' + encodeURIComponent(pageId),
    {
      method: 'patch',
      payload: JSON.stringify(patch)
    }
  );
}

function sourceApprovedNotionFetchJson_(url, options) {
  const token = getSourceApprovedNotionToken_();
  const params = {
    method: options.method,
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + token,
      'Notion-Version': VAM_SOURCE_NOTION_SYNC_CONFIG.NOTION_VERSION
    }
  };
  if (options.payload) {
    params.payload = options.payload;
  }

  const response = UrlFetchApp.fetch(url, params);
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('Notion request failed with HTTP ' + status + ': ' + text);
  }
  return text ? JSON.parse(text) : {};
}

function sourceApprovedNotionPropertyValue_(property) {
  if (!property) {
    return '';
  }
  switch (property.type) {
    case 'title':
      return sourceApprovedNotionJoinPlainText_(property.title);
    case 'rich_text':
      return sourceApprovedNotionJoinPlainText_(property.rich_text);
    case 'url':
      return property.url || '';
    case 'email':
      return property.email || '';
    case 'phone_number':
      return property.phone_number || '';
    case 'select':
      return property.select ? property.select.name : '';
    case 'status':
      return property.status ? property.status.name : '';
    case 'multi_select':
      return (property.multi_select || []).map(function(item) {
        return item.name || '';
      }).filter(Boolean).join(', ');
    case 'formula':
      return sourceApprovedNotionFormulaValue_(property.formula);
    case 'rollup':
      return sourceApprovedNotionRollupValue_(property.rollup);
    default:
      return '';
  }
}

function sourceApprovedNotionJoinPlainText_(items) {
  return (items || []).map(function(item) {
    return item.plain_text || '';
  }).join('').trim();
}

function sourceApprovedNotionFormulaValue_(formula) {
  if (!formula) {
    return '';
  }
  if (formula.type === 'string') {
    return formula.string || '';
  }
  if (formula.type === 'number') {
    return String(formula.number || '');
  }
  if (formula.type === 'boolean') {
    return formula.boolean ? 'true' : 'false';
  }
  if (formula.type === 'date') {
    return formula.date ? formula.date.start || '' : '';
  }
  return '';
}

function sourceApprovedNotionRollupValue_(rollup) {
  if (!rollup) {
    return '';
  }
  if (rollup.type === 'array') {
    return (rollup.array || []).map(sourceApprovedNotionPropertyValue_).filter(Boolean).join(', ');
  }
  if (rollup.type === 'number') {
    return String(rollup.number || '');
  }
  if (rollup.type === 'date') {
    return rollup.date ? rollup.date.start || '' : '';
  }
  return '';
}

function buildSourceApprovedNotionSyncSummary_(assets, pages, rows, dryRun) {
  return {
    dryRun: dryRun ? 'Yes' : 'No',
    approvedRowsRead: assets.length,
    notionPagesRead: pages.length,
    eligibleRows: rows.filter(function(row) {
      return row.action !== 'Skip' || row.reason.indexOf('Missing required field') !== 0;
    }).length,
    skippedRows: rows.filter(function(row) {
      return row.action === 'Skip';
    }).length,
    matchedRows: rows.filter(function(row) {
      return row.notionPageId;
    }).length,
    noChangeRows: rows.filter(function(row) {
      return row.action === 'No changes';
    }).length,
    wouldUpdateRows: rows.filter(function(row) {
      return row.action === 'Would update';
    }).length,
    updatedRows: rows.filter(function(row) {
      return row.action === 'Update';
    }).length,
    filenameMatchingUsed: 'No',
    googleSheetUpdated: 'No'
  };
}

function sourceApprovedNotionSyncSummaryRows_(summary) {
  return [
    { Metric: 'dry_run', Value: summary.dryRun },
    { Metric: 'approved_rows_read', Value: summary.approvedRowsRead },
    { Metric: 'notion_pages_read', Value: summary.notionPagesRead },
    { Metric: 'eligible_rows', Value: summary.eligibleRows },
    { Metric: 'skipped_rows', Value: summary.skippedRows },
    { Metric: 'matched_rows', Value: summary.matchedRows },
    { Metric: 'no_change_rows', Value: summary.noChangeRows },
    { Metric: 'would_update_rows', Value: summary.wouldUpdateRows },
    { Metric: 'updated_rows', Value: summary.updatedRows },
    { Metric: 'filename_matching_used', Value: summary.filenameMatchingUsed },
    { Metric: 'google_sheet_updated', Value: summary.googleSheetUpdated }
  ];
}

function sourceApprovedNotionSyncHeaders_() {
  return [
    'Row number',
    'Asset ID',
    'Drive File ID',
    'Source file link',
    'Notion Page ID',
    'Match method',
    'Action',
    'Changed properties',
    'Reason'
  ];
}

function toSourceApprovedNotionSyncCsvRow_(row) {
  return {
    'Row number': row.asset['Row number'],
    'Asset ID': row.asset['Asset ID'],
    'Drive File ID': row.asset['Drive File ID'],
    'Source file link': row.asset['Source file link'],
    'Notion Page ID': row.notionPageId || '',
    'Match method': row.matchMethod || '',
    'Action': row.action,
    'Changed properties': (row.changedProperties || []).join(', '),
    'Reason': row.reason || ''
  };
}

function sourceApprovedNotionSkipRow_(asset, action, reason) {
  return {
    asset: asset,
    notionPageId: '',
    matchMethod: '',
    action: action,
    reason: reason,
    changedProperties: [],
    patch: { properties: {} }
  };
}

function extractSourceApprovedGoogleDriveFileId_(value) {
  const text = String(value || '').trim();
  if (!/^https?:\/\//i.test(text)) {
    return '';
  }
  const patterns = [
    /\/file\/d\/([^/?#]+)/i,
    /[?&]id=([^&#]+)/i
  ];
  for (let i = 0; i < patterns.length; i += 1) {
    const match = text.match(patterns[i]);
    if (match && match[1]) {
      return decodeURIComponent(match[1]).trim();
    }
  }
  return '';
}

function getSourceApprovedNotionDatabaseId_() {
  const configured = String(VAM_SOURCE_NOTION_SYNC_CONFIG.NOTION_DATABASE_ID || '').trim();
  if (configured && configured.indexOf('PASTE_') !== 0) {
    return configured;
  }
  const stored = PropertiesService.getScriptProperties()
    .getProperty(VAM_SOURCE_NOTION_SYNC_CONFIG.NOTION_DATABASE_ID_PROPERTY_KEY);
  if (!stored) {
    throw new Error('Configure Notion database ID with setSourceApprovedNotionSyncConfig().');
  }
  return String(stored).trim();
}

function getSourceApprovedNotionToken_() {
  const token = PropertiesService.getScriptProperties()
    .getProperty(VAM_SOURCE_NOTION_SYNC_CONFIG.NOTION_TOKEN_PROPERTY_KEY);
  if (!token) {
    throw new Error('Missing script property: ' + VAM_SOURCE_NOTION_SYNC_CONFIG.NOTION_TOKEN_PROPERTY_KEY);
  }
  return String(token).trim();
}

function sourceApprovedNotionWritesEnabled_() {
  return PropertiesService.getScriptProperties()
    .getProperty(VAM_SOURCE_NOTION_SYNC_CONFIG.ENABLE_WRITES_PROPERTY_KEY) === 'YES';
}

/**
 * Digital Media Source Control Dashboard - Apps Script Backend
 * Version: 1.0 test bundle
 *
 * Purpose
 * - Provides a scalable, metadata-only review console for the image registry.
 * - Reads rows from the merged metadata sheet.
 * - Applies server-side filtering, sorting, pagination, summaries, and detail lookup.
 * - Allows limited, auditable review-routing edits.
 *
 * Safety Boundary
 * - This backend does NOT approve assets.
 * - It does NOT mark assets classroom-ready, reusable, source-cleared, production-ready,
 *   assessment-ready, modeling-ready, or instructionally approved.
 * - AI-generated values are treated as metadata evidence only.
 */

const DMSC_APP_CONFIG = {
  spreadsheetId: '1S3GNwqu0ehPXUA1j4FEksH1uEMKlxyEwAZWfIADPfpo',
  registrySheetName: 'Merged Image Prompt Metadata',
  driveImagesSheetName: 'Drive Images',
  auditLogSheetName: 'DMSC Audit Log',
  defaultPageSize: 50,
  maxPageSize: 100,
  safeEditableHeaders: [
    'Human Review Required',
    'Review Reason',
    'Next Owner',
    'Notes',
    'Metadata Classification Status'
  ]
};

/** Adds a custom menu when the spreadsheet opens. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('DMSC Dashboard')
    .addItem('Open Metadata Dashboard', 'showDmscDashboard')
    .addSeparator()
    .addItem('Refresh/Merge Metadata', 'dmscRunMergeFromDashboard')
    .addItem('Scan Drive Images', 'dmscRunDriveScanFromDashboard')
    .addToUi();
}

/** Opens the dashboard as a sidebar. */
function showDmscDashboard() {
  const template = HtmlService.createTemplateFromFile('Dashboard');
  const html = template.evaluate()
    .setTitle('DMSC Metadata Dashboard')
    .setWidth(460);
  SpreadsheetApp.getUi().showSidebar(html);
}

/** HTML include helper for CSS and JavaScript partials. */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Returns basic bootstrap data for the UI. */
function getDmscDashboardBootstrap() {
  return {
    ok: true,
    config: {
      registrySheetName: DMSC_APP_CONFIG.registrySheetName,
      defaultPageSize: DMSC_APP_CONFIG.defaultPageSize,
      safeEditableHeaders: DMSC_APP_CONFIG.safeEditableHeaders
    },
    queues: getDmscQueueDefinitions_(),
    summary: getDmscDashboardSummary()
  };
}

/** Returns summary counts used by top dashboard cards. */
function getDmscDashboardSummary() {
  const sheetInfo = getRegistrySheetInfo_();
  const rows = sheetInfo.rows;
  const summary = {
    totalRecords: rows.length,
    humanReviewRequired: 0,
    sourceClearanceNeeded: 0,
    noPromptEvidence: 0,
    duplicateGroups: 0,
    missingDriveIdentity: 0,
    visualAssetReview: 0,
    instructionalBlocked: 0,
    strongEvidence: 0,
    lastSync: ''
  };

  const duplicateGroups = {};

  rows.forEach(function(record) {
    const derived = deriveDashboardFields_(record);
    if (derived.humanReviewRequired === 'Yes') summary.humanReviewRequired++;
    if (derived.sourceControlClearanceNeeded === 'Yes') summary.sourceClearanceNeeded++;
    if (derived.promptEvidenceStatus === 'No Prompt Evidence') summary.noPromptEvidence++;
    if (!derived.fileId && !derived.driveUrl) summary.missingDriveIdentity++;
    if (derived.nextOwner === 'Visual Asset Director') summary.visualAssetReview++;
    if (derived.instructionalBlocked === 'Yes') summary.instructionalBlocked++;
    if (derived.strongMetadataEvidence === 'Yes') summary.strongEvidence++;

    const group = String(derived.duplicateCandidateGroup || '').trim();
    if (group) duplicateGroups[group] = true;

    const sync = String(derived.lastMetadataSyncTimestamp || '').trim();
    if (sync && (!summary.lastSync || sync > summary.lastSync)) summary.lastSync = sync;
  });

  summary.duplicateGroups = Object.keys(duplicateGroups).length;
  return summary;
}

/**
 * Returns paginated registry rows.
 * Request shape:
 * {
 *   queueId, search, nextOwner, promptStatus, sourceStatus,
 *   page, pageSize, sortBy, sortDirection
 * }
 */
function getDmscDashboardRows(request) {
  request = request || {};
  const pageSize = Math.min(
    Math.max(Number(request.pageSize || DMSC_APP_CONFIG.defaultPageSize), 1),
    DMSC_APP_CONFIG.maxPageSize
  );
  const page = Math.max(Number(request.page || 1), 1);

  const sheetInfo = getRegistrySheetInfo_();
  let records = sheetInfo.rows.map(function(record) {
    return buildListRecord_(record);
  });

  records = filterRecords_(records, request);
  records = sortRecords_(records, request.sortBy || 'lastMetadataSyncTimestamp', request.sortDirection || 'desc');

  const total = records.length;
  const start = (page - 1) * pageSize;
  const pageRecords = records.slice(start, start + pageSize);

  return {
    ok: true,
    page: page,
    pageSize: pageSize,
    total: total,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
    records: pageRecords,
    summary: getDmscDashboardSummary()
  };
}

/** Returns the full record for inspector/details by Image Identity ID or File ID. */
function getDmscDashboardRecord(identifier) {
  const id = String(identifier || '').trim();
  if (!id) throw new Error('Missing record identifier.');

  const sheetInfo = getRegistrySheetInfo_();
  for (let i = 0; i < sheetInfo.rows.length; i++) {
    const record = sheetInfo.rows[i];
    const derived = deriveDashboardFields_(record);
    if (derived.imageIdentityId === id || derived.fileId === id) {
      return {
        ok: true,
        rowNumber: record.__rowNumber,
        record: buildDetailRecord_(record),
        audit: getAuditLogForRecord_(derived.imageIdentityId || derived.fileId)
      };
    }
  }
  throw new Error('Record not found: ' + id);
}

/**
 * Updates review-routing fields only and appends an audit log entry.
 * Payload shape:
 * {
 *   imageIdentityId,
 *   updates: {
 *     'Human Review Required': 'Yes',
 *     'Review Reason': '...',
 *     'Next Owner': 'Source Authority Agent',
 *     'Notes': '...'
 *   }
 * }
 */
function updateDmscReviewMetadata(payload) {
  payload = payload || {};
  const imageIdentityId = String(payload.imageIdentityId || '').trim();
  const updates = payload.updates || {};
  if (!imageIdentityId) throw new Error('Missing imageIdentityId.');

  const ss = getDashboardSpreadsheet_();
  const sheet = ss.getSheetByName(DMSC_APP_CONFIG.registrySheetName);
  if (!sheet) throw new Error('Missing sheet: ' + DMSC_APP_CONFIG.registrySheetName);

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) throw new Error('No records available.');

  const headers = data[0].map(String);
  const imageIdIndex = findFirstHeaderIndex_(headers, ['Image Identity ID', 'ImageIdentityID', 'File ID']);
  if (imageIdIndex === -1) throw new Error('No Image Identity ID or File ID column found.');

  let targetRowNumber = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][imageIdIndex] || '').trim() === imageIdentityId) {
      targetRowNumber = i + 1;
      break;
    }
  }
  if (targetRowNumber === -1) throw new Error('Record not found for update: ' + imageIdentityId);

  const changed = [];
  Object.keys(updates).forEach(function(header) {
    if (DMSC_APP_CONFIG.safeEditableHeaders.indexOf(header) === -1) return;
    const columnIndex = ensureHeaderColumn_(sheet, header);
    const oldValue = sheet.getRange(targetRowNumber, columnIndex).getDisplayValue();
    const newValue = String(updates[header] == null ? '' : updates[header]);
    if (String(oldValue) !== newValue) {
      sheet.getRange(targetRowNumber, columnIndex).setValue(newValue);
      changed.push({ field: header, oldValue: oldValue, newValue: newValue });
    }
  });

  if (changed.length > 0) {
    const syncColumn = ensureHeaderColumn_(sheet, 'Last Metadata Sync Timestamp');
    sheet.getRange(targetRowNumber, syncColumn).setValue(new Date());
    appendAuditEntry_(imageIdentityId, 'Human Review Routing Update', changed, 'Dashboard UI');
  }

  return { ok: true, changed: changed.length, changes: changed };
}

/** Returns a deep link to the row in the spreadsheet. */
function getDmscSpreadsheetRowLink(identifier) {
  const result = getDmscDashboardRecord(identifier);
  const ss = getDashboardSpreadsheet_();
  const sheet = ss.getSheetByName(DMSC_APP_CONFIG.registrySheetName);
  return {
    ok: true,
    url: ss.getUrl() + '#gid=' + sheet.getSheetId() + '&range=A' + result.rowNumber,
    rowNumber: result.rowNumber
  };
}

/** Runs your existing Drive scan function if installed in this project. */
function dmscRunDriveScanFromDashboard() {
  if (typeof runDriveImageScanOnly !== 'function') {
    throw new Error('runDriveImageScanOnly() is not installed. Add the metadata pipeline code first.');
  }
  const start = new Date();
  runDriveImageScanOnly();
  appendAuditEntry_('SYSTEM', 'Drive Scan Triggered', [{ field: 'Action', oldValue: '', newValue: 'runDriveImageScanOnly' }], 'Dashboard UI');
  return { ok: true, startedAt: start, finishedAt: new Date() };
}

/** Runs your existing merge function if installed in this project. */
function dmscRunMergeFromDashboard() {
  if (typeof runMergedImagePromptMetadata !== 'function') {
    throw new Error('runMergedImagePromptMetadata() is not installed. Add the metadata pipeline code first.');
  }
  const start = new Date();
  const count = runMergedImagePromptMetadata();
  appendAuditEntry_('SYSTEM', 'Metadata Merge Triggered', [{ field: 'Action', oldValue: '', newValue: 'runMergedImagePromptMetadata' }], 'Dashboard UI');
  return { ok: true, rowsCreated: count || 0, startedAt: start, finishedAt: new Date() };
}

/** Queue definitions consumed by the UI. */
function getDmscQueueDefinitions_() {
  return [
    { id: 'all', label: 'All Metadata Records', group: 'Overview' },
    { id: 'missingIdentity', label: 'Missing Drive Identity', group: 'Fix Metadata' },
    { id: 'noPrompt', label: 'No Prompt Found', group: 'Fix Metadata' },
    { id: 'duplicateCandidates', label: 'Duplicate Candidates', group: 'Fix Metadata' },
    { id: 'sourceClearanceNeeded', label: 'Source-Control Clearance Needed', group: 'Source Review' },
    { id: 'safeForSourceReview', label: 'Safe for Source Review', group: 'Source Review' },
    { id: 'visualReview', label: 'Visual Asset Director Review', group: 'Curriculum Review' },
    { id: 'instructionalBlocked', label: 'Instructional Use Blocked', group: 'Curriculum Review' },
    { id: 'geminiCandidates', label: 'Gemini Metadata Candidates', group: 'Reference' },
    { id: 'strongEvidence', label: 'Strong Metadata Evidence - Not Approved', group: 'Reference' }
  ];
}

function getDashboardSpreadsheet_() {
  return SpreadsheetApp.openById(DMSC_APP_CONFIG.spreadsheetId);
}

function getRegistrySheetInfo_() {
  const ss = getDashboardSpreadsheet_();
  let sheet = ss.getSheetByName(DMSC_APP_CONFIG.registrySheetName);
  if (!sheet) sheet = ss.getSheetByName(DMSC_APP_CONFIG.driveImagesSheetName);
  if (!sheet) throw new Error('Could not find registry sheet or Drive Images sheet.');

  const values = sheet.getDataRange().getValues();
  if (values.length === 0) return { headers: [], rows: [], sheetName: sheet.getName() };

  const headers = values[0].map(function(value) { return String(value || '').trim(); });
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const record = { __rowNumber: i + 1, __sheetName: sheet.getName() };
    headers.forEach(function(header, index) {
      if (header) record[header] = values[i][index];
    });
    if (Object.keys(record).length > 2) rows.push(record);
  }
  return { headers: headers, rows: rows, sheetName: sheet.getName() };
}

function buildListRecord_(record) {
  const d = deriveDashboardFields_(record);
  return {
    imageIdentityId: d.imageIdentityId,
    fileName: d.fileName,
    normalizedFilename: d.normalizedFilename,
    fullPath: d.fullPath,
    fileId: d.fileId,
    driveUrl: d.driveUrl,
    promptEvidenceStatus: d.promptEvidenceStatus,
    promptMatchStatus: d.promptMatchStatus,
    sourceVerificationStatus: d.sourceVerificationStatus,
    sourceControlClearanceNeeded: d.sourceControlClearanceNeeded,
    duplicateCandidateGroup: d.duplicateCandidateGroup,
    humanReviewRequired: d.humanReviewRequired,
    reviewReason: d.reviewReason,
    nextOwner: d.nextOwner,
    strongMetadataEvidence: d.strongMetadataEvidence,
    instructionalBlocked: d.instructionalBlocked,
    lastMetadataSyncTimestamp: formatDateForUi_(d.lastMetadataSyncTimestamp),
    rowNumber: record.__rowNumber
  };
}

function buildDetailRecord_(record) {
  const d = deriveDashboardFields_(record);
  return {
    imageIdentityId: d.imageIdentityId,
    fileName: d.fileName,
    originalFilename: d.originalFilename,
    normalizedFilename: d.normalizedFilename,
    fileExtension: d.fileExtension,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    createdDate: formatDateForUi_(d.createdDate),
    level1Folder: d.level1Folder,
    level2Folder: d.level2Folder,
    level3Folder: d.level3Folder,
    fullPath: d.fullPath,
    fileId: d.fileId,
    driveUrl: d.driveUrl,
    geminiGuessedPrompt: d.geminiGuessedPrompt,
    openAiGuessedPrompt: d.openAiGuessedPrompt,
    projectedImagePrompt: d.projectedImagePrompt,
    promptSource: d.promptSource,
    promptMatchMethod: d.promptMatchMethod,
    promptEvidenceStatus: d.promptEvidenceStatus,
    promptMatchStatus: d.promptMatchStatus,
    matchKeyUsed: d.matchKeyUsed,
    promptEvidenceExcerpt: d.promptEvidenceExcerpt,
    sourceGroup: d.sourceGroup,
    sourceType: d.sourceType,
    sourceEvidenceStatus: d.sourceEvidenceStatus,
    sourceClassificationConfidence: d.sourceClassificationConfidence,
    sourceVerificationStatus: d.sourceVerificationStatus,
    sourceControlClearanceNeeded: d.sourceControlClearanceNeeded,
    duplicateCandidateGroup: d.duplicateCandidateGroup,
    humanReviewRequired: d.humanReviewRequired,
    reviewReason: d.reviewReason,
    nextOwner: d.nextOwner,
    doNotUseReason: d.doNotUseReason,
    metadataClassificationStatus: d.metadataClassificationStatus,
    lastMetadataSyncTimestamp: formatDateForUi_(d.lastMetadataSyncTimestamp),
    notes: d.notes,
    raw: record
  };
}

function deriveDashboardFields_(record) {
  const fileName = getAnyValue_(record, ['File Name', 'Original Filename', 'Name', 'Title']);
  const fileId = getAnyValue_(record, ['File ID', 'Image Identity ID', 'ImageIdentityID', 'Id', 'ID']);
  const driveUrl = getAnyValue_(record, ['Drive URL', 'File URL', 'URL']);
  const projected = getAnyValue_(record, ['Projected Image Prompt', 'AI Projected Prompt', 'Final Projected Image Prompt']);
  const gemini = getAnyValue_(record, ['Gemini Guessed Prompt', 'Gemini Projected Prompt']);
  const openai = getAnyValue_(record, ['OpenAI Guessed Prompt', 'OpenAI Projected Prompt', 'ChatGPT Guessed Prompt']);
  const promptStatus = getAnyValue_(record, ['Prompt Evidence Status']);
  const promptMatchStatus = getAnyValue_(record, ['Prompt Match Status']);
  const matchMethod = getAnyValue_(record, ['Prompt Match Method', 'Match Key Used']);
  const sourceStatus = getAnyValue_(record, ['Source Verification Status', 'Source Approval Status', 'Source-Control Status']);
  const sourceClearance = getAnyValue_(record, ['Source-Control Clearance Needed', 'Source Control Clearance Needed']);
  const humanReview = getAnyValue_(record, ['Human Review Required', 'Needs Review', 'Ready for Human Review']);
  const nextOwner = getAnyValue_(record, ['Next Owner', 'Owner']);
  const reviewReason = getAnyValue_(record, ['Review Reason', 'Notes']);
  const confidence = getAnyValue_(record, ['Source Classification Confidence', 'Confidence']);
  const duplicateGroup = getAnyValue_(record, ['Duplicate Candidate Group', 'DuplicateGroupID']);
  const fullPath = getAnyValue_(record, ['Full Path', 'Path']);
  const normalizedFilename = getAnyValue_(record, ['Normalized Filename']) || normalizeFilenameForDashboard_(fileName);
  const imageIdentityId = getAnyValue_(record, ['Image Identity ID', 'ImageIdentityID']) || fileId || normalizedFilename;

  const hasPrompt = !!cleanText_(projected || openai || gemini);
  const noPrompt = !hasPrompt || isErrorText_(projected || openai || gemini);
  const derivedPromptStatus = promptStatus || (noPrompt ? 'No Prompt Evidence' : 'AI Projected Prompt Evidence');
  const derivedPromptMatchStatus = promptMatchStatus || (noPrompt ? 'No Match' : 'AI Inferred');
  const derivedSourceStatus = sourceStatus || 'Source Unverified';
  const derivedClearance = sourceClearance || (derivedSourceStatus === 'Source Verified' ? 'No' : 'Yes');
  const derivedHumanReview = humanReview || 'Yes';
  const derivedNextOwner = nextOwner || (derivedClearance === 'Yes' ? 'Source Authority Agent' : 'Visual Asset Director');
  const numericConfidence = parseFloat(String(confidence).replace('%', ''));
  const strong = hasPrompt && !noPrompt && !duplicateGroup && derivedClearance !== 'Yes' && !isNaN(numericConfidence) && numericConfidence >= 80;

  return {
    imageIdentityId: imageIdentityId,
    fileName: fileName,
    originalFilename: getAnyValue_(record, ['Original Filename']) || fileName,
    normalizedFilename: normalizedFilename,
    fileExtension: getAnyValue_(record, ['File Extension']) || getFileExtension_(fileName),
    mimeType: getAnyValue_(record, ['Mime Type']),
    sizeBytes: getAnyValue_(record, ['Size Bytes']),
    createdDate: getAnyValue_(record, ['Created Date', 'Date Created', 'Created']),
    level1Folder: getAnyValue_(record, ['Level 1 Folder', 'Folder Level 1']),
    level2Folder: getAnyValue_(record, ['Level 2 Folder', 'Folder Level 2']),
    level3Folder: getAnyValue_(record, ['Level 3 Folder', 'Folder Level 3']),
    fullPath: fullPath,
    fileId: fileId,
    driveUrl: driveUrl,
    geminiGuessedPrompt: gemini,
    openAiGuessedPrompt: openai,
    projectedImagePrompt: projected,
    promptSource: getAnyValue_(record, ['Prompt Source']),
    promptMatchMethod: matchMethod,
    promptEvidenceStatus: derivedPromptStatus,
    promptMatchStatus: derivedPromptMatchStatus,
    matchKeyUsed: getAnyValue_(record, ['Match Key Used']) || matchMethod,
    promptEvidenceExcerpt: getAnyValue_(record, ['Prompt Evidence Excerpt']) || cleanText_(projected || openai || gemini).slice(0, 220),
    sourceGroup: getAnyValue_(record, ['Source Group', 'Source']),
    sourceType: getAnyValue_(record, ['Source Type']),
    sourceEvidenceStatus: getAnyValue_(record, ['Source Evidence Status']) || 'Not Verified',
    sourceClassificationConfidence: confidence,
    sourceVerificationStatus: derivedSourceStatus,
    sourceControlClearanceNeeded: derivedClearance,
    duplicateCandidateGroup: duplicateGroup,
    humanReviewRequired: derivedHumanReview,
    reviewReason: reviewReason || buildDefaultReviewReason_(noPrompt, duplicateGroup, derivedClearance),
    nextOwner: derivedNextOwner,
    doNotUseReason: getAnyValue_(record, ['Do Not Use Reason']),
    metadataClassificationStatus: getAnyValue_(record, ['Metadata Classification Status']) || 'Metadata Only',
    lastMetadataSyncTimestamp: getAnyValue_(record, ['Last Metadata Sync Timestamp', 'Last Sync Timestamp']),
    notes: getAnyValue_(record, ['Notes']),
    instructionalBlocked: derivedClearance === 'Yes' ? 'Yes' : 'No',
    strongMetadataEvidence: strong ? 'Yes' : 'No'
  };
}

function filterRecords_(records, request) {
  const queueId = String(request.queueId || 'all');
  const search = String(request.search || '').toLowerCase().trim();
  const nextOwner = String(request.nextOwner || '').trim();
  const promptStatus = String(request.promptStatus || '').trim();
  const sourceStatus = String(request.sourceStatus || '').trim();

  return records.filter(function(record) {
    if (!matchesQueue_(record, queueId)) return false;
    if (nextOwner && record.nextOwner !== nextOwner) return false;
    if (promptStatus && record.promptEvidenceStatus !== promptStatus) return false;
    if (sourceStatus && record.sourceVerificationStatus !== sourceStatus) return false;
    if (search) {
      const haystack = [
        record.imageIdentityId,
        record.fileName,
        record.normalizedFilename,
        record.fullPath,
        record.reviewReason,
        record.nextOwner,
        record.promptEvidenceStatus,
        record.sourceVerificationStatus
      ].join(' ').toLowerCase();
      if (haystack.indexOf(search) === -1) return false;
    }
    return true;
  });
}

function matchesQueue_(record, queueId) {
  switch (queueId) {
    case 'all': return true;
    case 'missingIdentity': return !record.fileId && !record.driveUrl;
    case 'noPrompt': return record.promptEvidenceStatus === 'No Prompt Evidence' || record.promptMatchStatus === 'No Match';
    case 'duplicateCandidates': return !!record.duplicateCandidateGroup;
    case 'sourceClearanceNeeded': return record.sourceControlClearanceNeeded === 'Yes';
    case 'safeForSourceReview': return !!record.fileId && record.humanReviewRequired === 'Yes';
    case 'visualReview': return record.nextOwner === 'Visual Asset Director';
    case 'instructionalBlocked': return record.instructionalBlocked === 'Yes';
    case 'geminiCandidates': return String(record.promptEvidenceStatus).indexOf('Gemini') !== -1 || String(record.reviewReason).indexOf('Gemini') !== -1;
    case 'strongEvidence': return record.strongMetadataEvidence === 'Yes';
    default: return true;
  }
}

function sortRecords_(records, sortBy, sortDirection) {
  const dir = String(sortDirection || 'asc').toLowerCase() === 'desc' ? -1 : 1;
  return records.sort(function(a, b) {
    const av = String(a[sortBy] == null ? '' : a[sortBy]).toLowerCase();
    const bv = String(b[sortBy] == null ? '' : b[sortBy]).toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function getAuditLogForRecord_(identifier) {
  const ss = getDashboardSpreadsheet_();
  const sheet = ss.getSheetByName(DMSC_APP_CONFIG.auditLogSheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const idIndex = findFirstHeaderIndex_(headers, ['Image Identity ID']);
  return data.slice(1)
    .filter(function(row) { return row[idIndex] === identifier || identifier === 'SYSTEM'; })
    .slice(-20)
    .reverse()
    .map(function(row) {
      return {
        timestamp: row[findFirstHeaderIndex_(headers, ['Timestamp'])] || '',
        actor: row[findFirstHeaderIndex_(headers, ['Actor'])] || '',
        action: row[findFirstHeaderIndex_(headers, ['Action'])] || '',
        field: row[findFirstHeaderIndex_(headers, ['Field'])] || '',
        oldValue: row[findFirstHeaderIndex_(headers, ['Old Value'])] || '',
        newValue: row[findFirstHeaderIndex_(headers, ['New Value'])] || '',
        source: row[findFirstHeaderIndex_(headers, ['Source'])] || ''
      };
    });
}

function appendAuditEntry_(imageIdentityId, action, changes, source) {
  const ss = getDashboardSpreadsheet_();
  let sheet = ss.getSheetByName(DMSC_APP_CONFIG.auditLogSheetName);
  if (!sheet) {
    sheet = ss.insertSheet(DMSC_APP_CONFIG.auditLogSheetName);
    sheet.appendRow(['Timestamp', 'Actor', 'Image Identity ID', 'Action', 'Field', 'Old Value', 'New Value', 'Source']);
    sheet.setFrozenRows(1);
  }

  const actor = Session.getActiveUser().getEmail() || 'Unknown user';
  const rows = (changes || []).map(function(change) {
    return [new Date(), actor, imageIdentityId, action, change.field, change.oldValue, change.newValue, source || 'Dashboard'];
  });
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
}

function ensureHeaderColumn_(sheet, headerName) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const existing = findFirstHeaderIndex_(headers, [headerName]);
  if (existing !== -1) return existing + 1;
  const newColumn = lastColumn + 1;
  sheet.getRange(1, newColumn).setValue(headerName).setFontWeight('bold');
  return newColumn;
}

function findFirstHeaderIndex_(headers, names) {
  const normalized = headers.map(normalizeHeader_);
  for (let i = 0; i < names.length; i++) {
    const target = normalizeHeader_(names[i]);
    const index = normalized.indexOf(target);
    if (index !== -1) return index;
  }
  return -1;
}

function getAnyValue_(record, names) {
  const keys = Object.keys(record || {});
  const normalizedMap = {};
  keys.forEach(function(key) { normalizedMap[normalizeHeader_(key)] = key; });
  for (let i = 0; i < names.length; i++) {
    const key = normalizedMap[normalizeHeader_(names[i])];
    if (key && record[key] != null && String(record[key]).trim() !== '') return record[key];
  }
  return '';
}

function normalizeHeader_(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
}

function cleanText_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isErrorText_(value) {
  const text = String(value || '').toLowerCase();
  return text.indexOf('api error') !== -1 || text.indexOf('parse error') !== -1 || text.indexOf('failed:') !== -1 || text.indexOf('skipped:') !== -1;
}

function normalizeFilenameForDashboard_(fileName) {
  return String(fileName || '').toLowerCase().replace(/\.[a-z0-9]{2,8}$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getFileExtension_(fileName) {
  const match = String(fileName || '').match(/\.([a-z0-9]{2,8})$/i);
  return match ? match[1].toLowerCase() : '';
}

function buildDefaultReviewReason_(noPrompt, duplicateGroup, clearanceNeeded) {
  const reasons = [];
  if (noPrompt) reasons.push('No prompt evidence found');
  if (duplicateGroup) reasons.push('Duplicate candidate group detected');
  if (clearanceNeeded === 'Yes') reasons.push('Source-control clearance needed');
  return reasons.join('; ') || 'Metadata-only record requires human review';
}

function formatDateForUi_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  }
  return String(value);
}

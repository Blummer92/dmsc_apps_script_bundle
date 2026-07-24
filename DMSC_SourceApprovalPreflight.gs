/**
 * Fail-closed source-approval preflight.
 *
 * This file performs no business or audit writes. The outer operation owns one
 * script lock and must retain it through the future #41 commit/verify/recovery
 * sequence before releasing it in a finally block.
 */

const DMSC_SOURCE_APPROVAL_AUDIT_HEADERS = [
  'Timestamp',
  'Actor',
  'Image Identity ID',
  'Action',
  'Field',
  'Old Value',
  'New Value',
  'Source'
];

const DMSC_SOURCE_APPROVAL_ALLOWED_FIELDS = [
  'source_approval_status',
  'approval_evidence_url',
  'approved_by',
  'approval_date',
  'restrictions',
  'approved_prompt',
  'approved_prompt_source',
  'source_notes',
  'pilot_review_status'
];

function withDmscSourceApprovalLock_(payload, readyCallback, options) {
  options = options || {};
  const timeoutMs = Number(options.timeoutMs || 5000);
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(timeoutMs)) {
    return buildDmscSourceApprovalBlockedResult_(payload, [
      'Script lock unavailable within ' + timeoutMs + 'ms.'
    ], false);
  }

  try {
    const preflight = preflightDmscSourceApproval_(payload, {
      lock: lock,
      spreadsheet: options.spreadsheet || null
    });

    if (preflight.status !== 'READY_FOR_COMMIT') return preflight;
    if (typeof readyCallback !== 'function') return preflight;
    return readyCallback(preflight);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function preflightDmscSourceApproval_(payload, context) {
  payload = payload || {};
  context = context || {};

  const blockers = [];
  const warnings = [];
  const fileId = String(payload.fileId || payload.imageIdentityId || '').trim();
  const operationId = String(payload.operationId || '').trim();
  const actor = String(payload.actor || '').trim();
  const action = String(payload.action || 'DMSC Source Approval').trim();
  const source = String(payload.source || '').trim();
  const proposedUpdates = payload.updates || {};
  const lock = context.lock || null;

  if (Object.prototype.hasOwnProperty.call(DMSC_APP_CONFIG, 'auditSheetName')) {
    blockers.push('Legacy DMSC_APP_CONFIG.auditSheetName is not supported.');
  }
  if (!String(DMSC_APP_CONFIG.auditLogSheetName || '').trim()) {
    blockers.push('Missing canonical DMSC_APP_CONFIG.auditLogSheetName.');
  }
  if (!fileId) blockers.push('Explicit fileId or imageIdentityId is required.');
  if (!operationId) blockers.push('Explicit operationId is required.');
  if (!actor) blockers.push('Explicit actor is required.');
  if (!source) blockers.push('Explicit source/reason is required.');
  if (!action) blockers.push('Explicit action is required.');
  if (!lock || typeof lock.hasLock !== 'function' || lock.hasLock() !== true) {
    blockers.push('Source approval preflight requires ownership of the shared script lock.');
  }

  const proposedFields = Object.keys(proposedUpdates);
  if (!proposedFields.length) blockers.push('At least one proposed update is required.');
  proposedFields.forEach(function(field) {
    if (DMSC_SOURCE_APPROVAL_ALLOWED_FIELDS.indexOf(field) === -1) {
      blockers.push('Unsupported source approval field: ' + field);
    }
  });

  let ss = context.spreadsheet || null;
  if (!ss && blockers.length === 0) ss = getDashboardSpreadsheet_();

  let sourceSheet = null;
  let auditSheet = null;
  if (ss) {
    sourceSheet = ss.getSheetByName(DMSC_APP_CONFIG.sourceLibrarySheetName);
    auditSheet = ss.getSheetByName(DMSC_APP_CONFIG.auditLogSheetName);
  }
  if (!sourceSheet) blockers.push('Missing source library sheet: ' + DMSC_APP_CONFIG.sourceLibrarySheetName);
  if (!auditSheet) blockers.push('Missing audit log sheet: ' + DMSC_APP_CONFIG.auditLogSheetName);

  const sourceHeaders = sourceSheet ? readDmscHeaderRow_(sourceSheet) : [];
  const auditHeaders = auditSheet ? readDmscHeaderRow_(auditSheet) : [];

  appendDmscHeaderBlockers_(sourceHeaders, ['file_id'].concat(proposedFields), 'source', blockers);
  appendDmscHeaderBlockers_(auditHeaders, DMSC_SOURCE_APPROVAL_AUDIT_HEADERS, 'audit', blockers, true);

  let targetRows = [];
  let originalValues = {};
  let rowNumber = null;

  if (sourceSheet && fileId && sourceHeaders.indexOf('file_id') !== -1) {
    targetRows = findDmscRowsByExactFileId_(sourceSheet, sourceHeaders, fileId);
    if (targetRows.length === 0) blockers.push('No source row found for file_id: ' + fileId);
    if (targetRows.length > 1) blockers.push('Duplicate source rows found for file_id: ' + fileId);
    if (targetRows.length === 1) {
      rowNumber = targetRows[0].rowNumber;
      proposedFields.forEach(function(field) {
        originalValues[field] = targetRows[0].record[field];
      });
    }
  }

  if (blockers.length) {
    return buildDmscSourceApprovalBlockedResult_(payload, blockers, Boolean(lock && lock.hasLock && lock.hasLock()), {
      warnings: warnings,
      sourceHeaders: sourceHeaders,
      auditHeaders: auditHeaders,
      rowNumber: rowNumber,
      originalValues: originalValues
    });
  }

  return {
    status: 'READY_FOR_COMMIT',
    operationId: operationId,
    fileId: fileId,
    actor: actor,
    action: action,
    source: source,
    sourceSheetName: DMSC_APP_CONFIG.sourceLibrarySheetName,
    auditSheetName: DMSC_APP_CONFIG.auditLogSheetName,
    rowNumber: rowNumber,
    sourceHeaders: sourceHeaders,
    auditHeaders: auditHeaders,
    proposedUpdates: proposedUpdates,
    originalValues: originalValues,
    lockAcquired: true,
    blockers: [],
    warnings: warnings,
    writeEvidence: { sourceWrites: 0, auditWrites: 0, propertyWrites: 0, formatWrites: 0 }
  };
}

function buildDmscSourceApprovalBlockedResult_(payload, blockers, lockAcquired, details) {
  payload = payload || {};
  details = details || {};
  return {
    status: 'BLOCKED_BEFORE_WRITE',
    operationId: String(payload.operationId || '').trim(),
    fileId: String(payload.fileId || payload.imageIdentityId || '').trim(),
    sourceSheetName: DMSC_APP_CONFIG.sourceLibrarySheetName,
    auditSheetName: DMSC_APP_CONFIG.auditLogSheetName,
    rowNumber: details.rowNumber || null,
    sourceHeaders: details.sourceHeaders || [],
    auditHeaders: details.auditHeaders || [],
    originalValues: details.originalValues || {},
    lockAcquired: lockAcquired === true,
    blockers: blockers.slice(),
    warnings: details.warnings || [],
    writeEvidence: { sourceWrites: 0, auditWrites: 0, propertyWrites: 0, formatWrites: 0 }
  };
}

function readDmscHeaderRow_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  return values[0].map(function(value) { return String(value || '').trim(); });
}

function appendDmscHeaderBlockers_(headers, required, label, blockers, exactOrder) {
  const seen = {};
  headers.forEach(function(header) {
    if (!header) return;
    seen[header] = (seen[header] || 0) + 1;
  });
  Object.keys(seen).forEach(function(header) {
    if (seen[header] > 1) blockers.push('Duplicate ' + label + ' header: ' + header);
  });
  required.forEach(function(header, index) {
    if (headers.indexOf(header) === -1) blockers.push('Missing ' + label + ' header: ' + header);
    if (exactOrder && headers[index] !== header) blockers.push('Unexpected ' + label + ' schema order at column ' + (index + 1) + ': expected ' + header + '.');
  });
}

function findDmscRowsByExactFileId_(sheet, headers, fileId) {
  const values = sheet.getDataRange().getValues();
  const fileIdIndex = headers.indexOf('file_id');
  const matches = [];
  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (String(values[rowIndex][fileIdIndex] || '').trim() !== fileId) continue;
    const record = {};
    headers.forEach(function(header, columnIndex) {
      record[header] = values[rowIndex][columnIndex];
    });
    matches.push({ rowNumber: rowIndex + 1, record: record });
  }
  return matches;
}

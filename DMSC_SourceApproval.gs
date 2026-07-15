/**
 * Approves the source record for one DMSC asset.
 *
 * Safe mutation boundary:
 * - Updates only DM Source Library Pilot.
 * - Does not mutate Drive files.
 * - Does not mutate registry identity fields.
 * - Does not scan Drive.
 * - Does not change sharing settings.
 */
function approveDmscSourceForAsset(payload) {
  payload = payload || {};

  const fileId = String(payload.fileId || payload.imageIdentityId || '').trim();
  const approvalEvidenceUrl = String(payload.approvalEvidenceUrl || '').trim();
  const restrictions = String(payload.restrictions || '').trim();
  const sourceNotes = String(payload.sourceNotes || '').trim();
  const approvedPrompt = String(payload.approvedPrompt || '').trim();
  const approvedPromptSource = String(payload.approvedPromptSource || '').trim();

  if (!fileId) {
    throw new Error('approveDmscSourceForAsset requires fileId or imageIdentityId.');
  }

  if (!approvalEvidenceUrl) {
    throw new Error('approveDmscSourceForAsset requires approvalEvidenceUrl.');
  }

  const ss = getDashboardSpreadsheet_();
  const sheet = ss.getSheetByName(DMSC_APP_CONFIG.sourceLibrarySheetName);
  if (!sheet) {
    throw new Error('Missing source library sheet: ' + DMSC_APP_CONFIG.sourceLibrarySheetName);
  }

  const lookup = findDmscSourceLibraryRowByFileId_(sheet, fileId);
  if (!lookup) {
    throw new Error('No source library row found for fileId: ' + fileId);
  }

  const actor = getDmscCurrentUserEmail_();
  const approvalDate = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd'
  );

  const updates = {
    source_approval_status: 'Approved',
    approval_evidence_url: approvalEvidenceUrl,
    approved_by: actor,
    approval_date: approvalDate,
    restrictions: restrictions,
    source_notes: sourceNotes || 'Approved through DMSC source approval backend.',
    pilot_review_status: 'Production Approved'
  };

  if (approvedPrompt) {
    updates.approved_prompt = approvedPrompt;
  }

  if (approvedPromptSource) {
    updates.approved_prompt_source = approvedPromptSource;
  }

  const changes = applyDmscSourceLibraryUpdates_(sheet, lookup, updates, {
    action: 'DMSC Source Approval',
    source: 'Backend Function'
  });

  const refreshed = getDmscDashboardRecord(fileId);

  return {
    ok: true,
    fileId: fileId,
    rowNumber: lookup.rowNumber,
    changed: changes.length,
    changes: changes,
    record: refreshed.record
  };
}

/**
 * Round-trip test for source approval.
 *
 * This test temporarily approves the first dashboard record, verifies the
 * dashboard reflects the approval, and then restores the original source
 * library values.
 */
function testApproveDmscSourceForAssetRoundTrip() {
  const rows = getDmscDashboardRows({ page: 1, pageSize: 1 }).records;
  if (!rows.length) {
    throw new Error('No dashboard rows found.');
  }

  const target = rows[0];
  const ss = getDashboardSpreadsheet_();
  const sheet = ss.getSheetByName(DMSC_APP_CONFIG.sourceLibrarySheetName);
  const lookup = findDmscSourceLibraryRowByFileId_(sheet, target.fileId);

  if (!lookup) {
    throw new Error('No source library row found for fileId: ' + target.fileId);
  }

  const original = copyDmscSourceLibraryRecord_(lookup.record);

  let approvalResult;
  let approvedRecord;
  let restoredRecord;

  try {
    approvalResult = approveDmscSourceForAsset({
      fileId: target.fileId,
      approvalEvidenceUrl: 'https://example.com/dmsc-source-approval-round-trip',
      restrictions: 'Temporary backend round-trip test only.',
      sourceNotes: 'Temporary approval written by testApproveDmscSourceForAssetRoundTrip.'
    });

    approvedRecord = getDmscDashboardRecord(target.fileId).record;

    if (approvedRecord.sourceControlClearanceNeeded !== 'No') {
      throw new Error(
        'Expected sourceControlClearanceNeeded=No after approval, got: ' +
        approvedRecord.sourceControlClearanceNeeded
      );
    }

    return {
      ok: true,
      approvalResult: {
        changed: approvalResult.changed,
        rowNumber: approvalResult.rowNumber
      },
      approvedState: {
        sourceVerificationStatus: approvedRecord.sourceVerificationStatus,
        sourceControlClearanceNeeded: approvedRecord.sourceControlClearanceNeeded
      }
    };
  } finally {
    const restoreLookup = findDmscSourceLibraryRowByFileId_(sheet, target.fileId);

    applyDmscSourceLibraryUpdates_(sheet, restoreLookup, original, {
      action: 'DMSC Source Approval Test Restore',
      source: 'Backend Test'
    });

    restoredRecord = getDmscDashboardRecord(target.fileId).record;

    Logger.log(JSON.stringify({
      restoreCompleted: true,
      restoredState: {
        sourceVerificationStatus: restoredRecord.sourceVerificationStatus,
        sourceControlClearanceNeeded: restoredRecord.sourceControlClearanceNeeded
      }
    }, null, 2));
  }
}

function findDmscSourceLibraryRowByFileId_(sheet, fileId) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(function(header) {
    return String(header || '').trim();
  });

  const fileIdIndex = headers.indexOf('file_id');
  if (fileIdIndex === -1) {
    throw new Error('Missing source library file_id header.');
  }

  for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
    if (String(values[rowIndex][fileIdIndex] || '').trim() === fileId) {
      const record = {};
      headers.forEach(function(header, columnIndex) {
        record[header] = values[rowIndex][columnIndex];
      });

      return {
        rowNumber: rowIndex + 1,
        headers: headers,
        record: record
      };
    }
  }

  return null;
}

function applyDmscSourceLibraryUpdates_(sheet, lookup, updates, options) {
  options = options || {};

  const allowedHeaders = [
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

  const actor = getDmscCurrentUserEmail_();
  const changes = [];

  allowedHeaders.forEach(function(header) {
    if (!Object.prototype.hasOwnProperty.call(updates, header)) return;

    const columnIndex = lookup.headers.indexOf(header);
    if (columnIndex === -1) {
      throw new Error('Missing source library header: ' + header);
    }

    const oldValue = String(lookup.record[header] || '');
    const newValue = String(updates[header] || '');

    if (oldValue === newValue) return;

    sheet.getRange(lookup.rowNumber, columnIndex + 1).setValue(newValue);

    changes.push({
      field: header,
      oldValue: oldValue,
      newValue: newValue
    });

    appendDmscSourceApprovalAudit_(actor, options.action || 'DMSC Source Approval', header, oldValue, newValue, options.source || 'Backend Function');
  });

  return changes;
}

function copyDmscSourceLibraryRecord_(record) {
  return {
    source_approval_status: record.source_approval_status || '',
    approval_evidence_url: record.approval_evidence_url || '',
    approved_by: record.approved_by || '',
    approval_date: record.approval_date || '',
    restrictions: record.restrictions || '',
    approved_prompt: record.approved_prompt || '',
    approved_prompt_source: record.approved_prompt_source || '',
    source_notes: record.source_notes || '',
    pilot_review_status: record.pilot_review_status || ''
  };
}

function appendDmscSourceApprovalAudit_(actor, action, field, oldValue, newValue, source) {
  const ss = getDashboardSpreadsheet_();
  const sheet = ss.getSheetByName(DMSC_APP_CONFIG.auditSheetName);
  if (!sheet) return;

  sheet.appendRow([
    new Date(),
    actor,
    action,
    field,
    oldValue,
    newValue,
    source
  ]);
}

function getDmscCurrentUserEmail_() {
  const email = Session.getActiveUser().getEmail();
  return email || 'unknown-user';
}

function inspectDmscSourceApprovalState() {
  const rows = getDmscDashboardRows({ page: 1, pageSize: 1 }).records;
  if (!rows.length) throw new Error('No dashboard rows found.');

  const target = rows[0];
  const detail = getDmscDashboardRecord(target.fileId);

  const ss = getDashboardSpreadsheet_();
  const sheet = ss.getSheetByName(DMSC_APP_CONFIG.sourceLibrarySheetName);
  const lookup = findDmscSourceLibraryRowByFileId_(sheet, target.fileId);

  Logger.log(JSON.stringify({
    fileId: target.fileId,
    fileName: target.fileName,
    dashboardState: {
      sourceVerificationStatus: detail.record.sourceVerificationStatus,
      sourceControlClearanceNeeded: detail.record.sourceControlClearanceNeeded,
      reviewReason: detail.record.reviewReason
    },
    sourceLibraryRow: {
      rowNumber: lookup.rowNumber,
      source_approval_status: lookup.record.source_approval_status,
      approval_evidence_url: lookup.record.approval_evidence_url,
      approved_by: lookup.record.approved_by,
      approval_date: lookup.record.approval_date,
      restrictions: lookup.record.restrictions,
      approved_prompt: lookup.record.approved_prompt,
      approved_prompt_source: lookup.record.approved_prompt_source,
      source_notes: lookup.record.source_notes,
      pilot_review_status: lookup.record.pilot_review_status
    }
  }, null, 2));
}

function repairDmscSourceApprovalRoundTripTarget() {
  const fileId = '1utG2zYpmRjAZt8TsMIfv7IOmMZxnJwQo';

  const ss = getDashboardSpreadsheet_();
  const sheet = ss.getSheetByName(DMSC_APP_CONFIG.sourceLibrarySheetName);
  const lookup = findDmscSourceLibraryRowByFileId_(sheet, fileId);

  if (!lookup) {
    throw new Error('No source library row found for fileId: ' + fileId);
  }

  const changes = applyDmscSourceLibraryUpdates_(sheet, lookup, {
    source_approval_status: 'Pilot Review Only',
    approval_evidence_url: '',
    approval_date: '',
    restrictions: '',
    source_notes: 'Pilot row copied from Drive Images row 2 by exact File ID. Source approval evidence intentionally blank; not production approved.',
    pilot_review_status: 'Pilot Review Only'
  }, {
    action: 'DMSC Source Approval Test Repair',
    source: 'Backend Repair'
  });

  const restored = getDmscDashboardRecord(fileId).record;

  Logger.log(JSON.stringify({
    ok: true,
    changed: changes.length,
    changes: changes,
    restoredState: {
      sourceVerificationStatus: restored.sourceVerificationStatus,
      sourceControlClearanceNeeded: restored.sourceControlClearanceNeeded
    }
  }, null, 2));
}

/**
 * Returns a read-only source approval preview for one asset.
 *
 * This function does not write to the workbook.
 */
function getDmscSourceApprovalPreview(fileIdOrPayload) {
  const fileId = typeof fileIdOrPayload === 'object'
    ? String((fileIdOrPayload || {}).fileId || (fileIdOrPayload || {}).imageIdentityId || '').trim()
    : String(fileIdOrPayload || '').trim();

  if (!fileId) {
    throw new Error('getDmscSourceApprovalPreview requires fileId or imageIdentityId.');
  }

  const detail = getDmscDashboardRecord(fileId);

  const ss = getDashboardSpreadsheet_();
  const sheet = ss.getSheetByName(DMSC_APP_CONFIG.sourceLibrarySheetName);
  if (!sheet) {
    throw new Error('Missing source library sheet: ' + DMSC_APP_CONFIG.sourceLibrarySheetName);
  }

  const lookup = findDmscSourceLibraryRowByFileId_(sheet, fileId);
  if (!lookup) {
    throw new Error('No source library row found for fileId: ' + fileId);
  }

  const sourceRecord = lookup.record;
  const currentStatus = String(sourceRecord.source_approval_status || '').trim();
  const currentEvidence = String(sourceRecord.approval_evidence_url || '').trim();

  const blockers = [];
  const warnings = [];

  if (currentStatus === 'Approved') {
    warnings.push('Source is already marked Approved.');
  }

  if (!String(sourceRecord.file_id || '').trim()) {
    blockers.push('Missing file_id in source library.');
  }

  if (!String(sourceRecord.drive_url || '').trim()) {
    blockers.push('Missing drive_url in source library.');
  }

  if (!String(sourceRecord.file_name || '').trim()) {
    blockers.push('Missing file_name in source library.');
  }

  if (!String(sourceRecord.approved_prompt || detail.record.proposedPrompt || '').trim()) {
    warnings.push('No approved prompt or proposed prompt is available.');
  }

  return {
    ok: true,
    fileId: fileId,
    fileName: detail.record.fileName,
    canApproveWithEvidence: blockers.length === 0,
    requiresApprovalEvidenceUrl: true,
    currentState: {
      sourceApprovalStatus: currentStatus,
      approvalEvidenceUrl: currentEvidence,
      approvedBy: sourceRecord.approved_by || '',
      approvalDate: sourceRecord.approval_date || '',
      pilotReviewStatus: sourceRecord.pilot_review_status || '',
      sourceVerificationStatus: detail.record.sourceVerificationStatus,
      sourceControlClearanceNeeded: detail.record.sourceControlClearanceNeeded
    },
    proposedChanges: {
      source_approval_status: 'Approved',
      approval_evidence_url: '[required evidence URL]',
      approved_by: getDmscCurrentUserEmail_(),
      approval_date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      pilot_review_status: 'Production Approved'
    },
    blockers: blockers,
    warnings: warnings
  };
}

function testGetDmscSourceApprovalPreview() {
  const rows = getDmscDashboardRows({ page: 1, pageSize: 1 }).records;
  if (!rows.length) throw new Error('No dashboard rows found.');

  const preview = getDmscSourceApprovalPreview(rows[0].fileId);

  Logger.log(JSON.stringify(preview, null, 2));
  return preview;
}

/**
 * Returns read-only source approval previews for multiple assets.
 *
 * Payload shapes:
 * - { fileIds: ['id1', 'id2', ...] }
 * - { queueId: 'sourceClearanceNeeded', limit: 5 }
 *
 * This function does not write to the workbook. Missing or invalid ids
 * produce per-record error items instead of failing the whole batch.
 */
function getDmscSourceApprovalPreviewBatch(payload) {
  payload = payload || {};

  let fileIds = [];

  if (payload.fileIds && Object.prototype.toString.call(payload.fileIds) === '[object Array]') {
    fileIds = payload.fileIds.map(function(id) {
      return String(id == null ? '' : id).trim();
    });
  } else if (payload.queueId || payload.limit) {
    const queuePage = getDmscDashboardRows({
      queueId: payload.queueId,
      page: 1,
      pageSize: payload.limit || 5
    });
    fileIds = queuePage.records.map(function(record) {
      return String(record.fileId || record.imageIdentityId || '').trim();
    });
  } else {
    throw new Error('getDmscSourceApprovalPreviewBatch requires fileIds[] or { queueId, limit }.');
  }

  const previews = fileIds.map(function(fileId) {
    try {
      return getDmscSourceApprovalPreview(fileId);
    } catch (error) {
      return {
        ok: false,
        fileId: fileId,
        error: error && error.message ? error.message : String(error)
      };
    }
  });

  const summary = {
    previewed: previews.length,
    readyWithEvidence: 0,
    blocked: 0,
    warnings: 0,
    errors: 0
  };

  previews.forEach(function(preview) {
    if (preview.ok !== true) {
      summary.errors++;
      return;
    }
    if (preview.canApproveWithEvidence) summary.readyWithEvidence++;
    if (preview.blockers && preview.blockers.length > 0) summary.blocked++;
    if (preview.warnings && preview.warnings.length > 0) summary.warnings++;
  });

  return {
    ok: true,
    total: previews.length,
    summary: summary,
    previews: previews
  };
}

/**
 * Read-only test for the batch source approval preview.
 *
 * Loads the first 5 records from the sourceClearanceNeeded queue, runs the
 * batch preview, and verifies the contract without writing to the workbook.
 */
function testGetDmscSourceApprovalPreviewBatch() {
  const ss = getDashboardSpreadsheet_();
  const sourceSheet = ss.getSheetByName(DMSC_APP_CONFIG.sourceLibrarySheetName);
  const auditSheet = ss.getSheetByName(DMSC_APP_CONFIG.auditLogSheetName);

  const sourceRowsBefore = sourceSheet ? sourceSheet.getLastRow() : 0;
  const auditRowsBefore = auditSheet ? auditSheet.getLastRow() : 0;

  const result = getDmscSourceApprovalPreviewBatch({
    queueId: 'sourceClearanceNeeded',
    limit: 5
  });

  if (result.ok !== true) throw new Error('Batch preview did not return ok=true.');
  if (!(result.total > 0)) throw new Error('Batch preview returned total=0; expected records in sourceClearanceNeeded queue.');
  if (!result.previews || result.previews.length !== result.total) {
    throw new Error('Batch preview total does not match previews length.');
  }
  if (!result.summary || result.summary.previewed !== result.total) {
    throw new Error('Batch preview summary.previewed does not match total.');
  }

  result.previews.forEach(function(preview, index) {
    if (preview.ok !== true) {
      throw new Error('Preview ' + index + ' returned an error: ' + preview.error);
    }
    if (!String(preview.fileId || '').trim()) throw new Error('Preview ' + index + ' missing fileId.');
    if (!String(preview.fileName || '').trim()) throw new Error('Preview ' + index + ' missing fileName.');
    if (typeof preview.canApproveWithEvidence !== 'boolean') throw new Error('Preview ' + index + ' missing canApproveWithEvidence boolean.');
    if (!preview.blockers || typeof preview.blockers.length !== 'number') throw new Error('Preview ' + index + ' missing blockers array.');
    if (!preview.warnings || typeof preview.warnings.length !== 'number') throw new Error('Preview ' + index + ' missing warnings array.');
  });

  const sourceRowsAfter = sourceSheet ? sourceSheet.getLastRow() : 0;
  const auditRowsAfter = auditSheet ? auditSheet.getLastRow() : 0;

  if (sourceRowsAfter !== sourceRowsBefore) {
    throw new Error('Batch preview changed source library row count; expected read-only behavior.');
  }
  if (auditRowsAfter !== auditRowsBefore) {
    throw new Error('Batch preview appended audit rows; expected read-only behavior.');
  }

  Logger.log(JSON.stringify({
    ok: true,
    total: result.total,
    summary: result.summary,
    firstPreviewFileId: result.previews[0].fileId
  }, null, 2));

  return result;
}

/**
 * Returns read-only source approval previews for multiple assets.
 *
 * Supported payloads:
 * - { fileIds: string[] }
 * - { queueId: string, limit: number }
 *
 * This function does not write to the workbook.
 */
function getDmscSourceApprovalPreviewBatch(payload) {
  payload = payload || {};

  const errors = [];
  let fileIds = [];

  if (Array.isArray(payload.fileIds) && payload.fileIds.length) {
    fileIds = payload.fileIds.map(function(fileId) {
      return String(fileId || '').trim();
    }).filter(Boolean);
  } else {
    const queueId = String(payload.queueId || 'sourceClearanceNeeded').trim();
    const limit = Math.max(1, Math.min(Number(payload.limit || 10), 50));

    const rows = getDmscDashboardRows({
      queueId: queueId,
      page: 1,
      pageSize: limit
    }).records || [];

    fileIds = rows.map(function(record) {
      return String(record.fileId || record.imageIdentityId || '').trim();
    }).filter(Boolean);
  }

  const previews = fileIds.map(function(fileId) {
    try {
      return getDmscSourceApprovalPreview(fileId);
    } catch (error) {
      return {
        ok: false,
        fileId: fileId,
        error: error && error.message ? error.message : String(error),
        blockers: ['Preview failed for this asset.'],
        warnings: []
      };
    }
  });

  previews.forEach(function(preview) {
    if (preview && preview.ok === false) {
      errors.push({
        fileId: preview.fileId || '',
        error: preview.error || 'Unknown preview error.'
      });
    }
  });

  return {
    ok: true,
    total: previews.length,
    summary: {
      requested: fileIds.length,
      previewed: previews.length,
      readyWithEvidence: previews.filter(function(preview) {
        return preview && preview.ok === true && preview.canApproveWithEvidence === true;
      }).length,
      errors: errors.length
    },
    previews: previews,
    errors: errors
  };
}

function testGetDmscSourceApprovalPreviewBatch() {
  const ss = getDashboardSpreadsheet_();
  const auditSheet = ss.getSheetByName(DMSC_APP_CONFIG.auditSheetName);
  const auditRowsBefore = auditSheet ? auditSheet.getLastRow() : 0;

  const result = getDmscSourceApprovalPreviewBatch({
    queueId: 'sourceClearanceNeeded',
    limit: 5
  });

  const auditRowsAfter = auditSheet ? auditSheet.getLastRow() : 0;

  if (result.ok !== true) {
    throw new Error('Batch preview did not return ok=true.');
  }

  if (result.total <= 0) {
    throw new Error('Batch preview returned no previews.');
  }

  if (auditRowsBefore !== auditRowsAfter) {
    throw new Error('Batch preview wrote to audit log; expected read-only behavior.');
  }

  result.previews.forEach(function(preview, index) {
    if (!preview.fileId) {
      throw new Error('Preview ' + index + ' missing fileId.');
    }

    if (!Object.prototype.hasOwnProperty.call(preview, 'canApproveWithEvidence') && preview.ok !== false) {
      throw new Error('Preview ' + index + ' missing canApproveWithEvidence.');
    }

    if (!Array.isArray(preview.blockers)) {
      throw new Error('Preview ' + index + ' missing blockers array.');
    }

    if (!Array.isArray(preview.warnings)) {
      throw new Error('Preview ' + index + ' missing warnings array.');
    }
  });

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

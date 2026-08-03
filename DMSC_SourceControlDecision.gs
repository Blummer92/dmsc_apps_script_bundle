function approveDmscSourceControlDecision(payload) {
  payload = payload || {};

  const fileId = String(payload.fileId || payload.imageIdentityId || '').trim();
  const approvalEvidenceUrl = String(payload.approvalEvidenceUrl || '').trim();
  const restrictions = String(payload.restrictions || '').trim();
  const sourceNotes = String(payload.sourceNotes || '').trim();
  const approvedPrompt = String(payload.approvedPrompt || '').trim();
  const approvedPromptSource = String(payload.approvedPromptSource || '').trim();

  if (!fileId) {
    throw new Error('approveDmscSourceControlDecision requires fileId or imageIdentityId.');
  }
  if (!approvalEvidenceUrl) {
    throw new Error('approveDmscSourceControlDecision requires approvalEvidenceUrl.');
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
  const approvalDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const updates = {
    source_approval_status: 'Approved',
    approval_evidence_url: approvalEvidenceUrl,
    approved_by: actor,
    approval_date: approvalDate,
    restrictions: restrictions,
    source_notes: sourceNotes || 'Source-control approval recorded by the DMSC backend.',
    pilot_review_status: 'Source Control Approved'
  };

  if (approvedPrompt) updates.approved_prompt = approvedPrompt;
  if (approvedPromptSource) updates.approved_prompt_source = approvedPromptSource;

  const changes = applyDmscSourceLibraryUpdates_(sheet, lookup, updates, {
    action: 'DMSC Source Control Decision',
    source: 'Backend Function'
  });

  const refreshed = getDmscDashboardRecord(fileId);
  return {
    ok: true,
    decision_scope: 'source_control_only',
    production_authorized: false,
    production_authorization_owner: 'Production Control',
    fileId: fileId,
    rowNumber: lookup.rowNumber,
    changed: changes.length,
    changes: changes,
    record: refreshed.record
  };
}
/**
 * Approved live-smoke entry points.
 *
 * These wrappers are the only live-smoke functions approved by
 * config/live-smoke-suites.json. Legacy mutation suites remain blocked.
 */

function runDmscReadOnlySmokeChecks() {
  const startedAt = new Date();
  const checks = [];

  function run(name, fn) {
    try {
      const detail = fn();
      checks.push({ name: name, status: 'PASS', detail: detail || '' });
    } catch (error) {
      checks.push({ name: name, status: 'FAIL', detail: error && error.message ? error.message : String(error) });
    }
  }

  run('dashboard bootstrap', function() {
    const result = getDmscDashboardBootstrap();
    if (!result || result.ok !== true) throw new Error('Bootstrap did not return ok=true.');
    return 'queues=' + (result.queues || []).length;
  });

  run('dashboard summary', function() {
    const result = getDmscDashboardSummary();
    if (!result || Number(result.totalRecords || 0) < 0) throw new Error('Summary returned an invalid record count.');
    return 'totalRecords=' + Number(result.totalRecords || 0);
  });

  run('first page read', function() {
    const result = getDmscDashboardRows({ page: 1, pageSize: 1 });
    if (!result || result.ok !== true) throw new Error('Rows endpoint did not return ok=true.');
    return 'returned=' + (result.records || []).length;
  });

  const failed = checks.filter(function(check) { return check.status === 'FAIL'; }).length;
  return {
    suite: 'root-read-only',
    classification: 'read-only',
    startedAt: startedAt,
    finishedAt: new Date(),
    overallStatus: failed ? 'FAIL' : 'PASS',
    passed: checks.length - failed,
    failed: failed,
    cleanup: { required: false, attempted: false, verified: true },
    remainingSideEffects: [],
    checks: checks
  };
}

function runDmscAuthorizedSourceApprovalRoundTrip() {
  const props = PropertiesService.getScriptProperties();
  const mode = String(props.getProperty('DMSC_LIVE_SMOKE_MODE') || '').trim();
  const confirmation = String(props.getProperty('DMSC_LIVE_SMOKE_CONFIRMATION') || '').trim();
  const fileId = String(props.getProperty('DMSC_LIVE_SMOKE_TARGET_FILE_ID') || '').trim();

  if (mode !== 'MUTATION_ALLOWED') {
    throw new Error('Blocked: DMSC_LIVE_SMOKE_MODE must be MUTATION_ALLOWED.');
  }
  if (confirmation !== 'YES_I_ACKNOWLEDGE_LIVE_MUTATION') {
    throw new Error('Blocked: explicit live-mutation confirmation is missing.');
  }
  if (!fileId) {
    throw new Error('Blocked: DMSC_LIVE_SMOKE_TARGET_FILE_ID is required.');
  }

  const startedAt = new Date();
  const ss = getDashboardSpreadsheet_();
  const sourceSheet = ss.getSheetByName(DMSC_APP_CONFIG.sourceLibrarySheetName);
  if (!sourceSheet) throw new Error('Missing source library sheet: ' + DMSC_APP_CONFIG.sourceLibrarySheetName);

  const lookup = findDmscSourceLibraryRowByFileId_(sourceSheet, fileId);
  if (!lookup) throw new Error('No source library row found for authorized fileId: ' + fileId);

  const original = copyDmscSourceLibraryRecord_(lookup.record);
  const auditSheetName = DMSC_APP_CONFIG.auditLogSheetName || DMSC_APP_CONFIG.auditSheetName || 'DMSC Audit Log';
  const auditSheet = ss.getSheetByName(auditSheetName);
  const auditRowsBefore = auditSheet ? auditSheet.getLastRow() : 0;
  const mutations = [];
  let assertionPassed = false;
  let cleanupAttempted = false;
  let cleanupVerified = false;
  let cleanupError = '';

  try {
    const result = approveDmscSourceForAsset({
      fileId: fileId,
      approvalEvidenceUrl: 'https://example.com/dmsc-authorized-live-smoke',
      restrictions: 'Temporary authorized live-smoke mutation only.',
      sourceNotes: 'Temporary mutation from runDmscAuthorizedSourceApprovalRoundTrip.'
    });
    mutations.push.apply(mutations, result.changes || []);

    const approved = getDmscDashboardRecord(fileId).record;
    if (approved.sourceControlClearanceNeeded !== 'No') {
      throw new Error('Expected sourceControlClearanceNeeded=No after temporary approval.');
    }
    assertionPassed = true;
  } finally {
    cleanupAttempted = true;
    try {
      const restoreLookup = findDmscSourceLibraryRowByFileId_(sourceSheet, fileId);
      if (!restoreLookup) throw new Error('Authorized target disappeared before cleanup.');
      applyDmscSourceLibraryUpdates_(sourceSheet, restoreLookup, original, {
        action: 'DMSC Authorized Live Smoke Restore',
        source: 'DMSC Live Smoke Safety'
      });

      const verifiedLookup = findDmscSourceLibraryRowByFileId_(sourceSheet, fileId);
      const restored = copyDmscSourceLibraryRecord_(verifiedLookup.record);
      const fields = Object.keys(original);
      const mismatched = fields.filter(function(field) {
        return String(original[field] || '') !== String(restored[field] || '');
      });
      if (mismatched.length) {
        throw new Error('Cleanup verification failed for fields: ' + mismatched.join(', '));
      }
      cleanupVerified = true;
    } catch (error) {
      cleanupError = error && error.message ? error.message : String(error);
      cleanupVerified = false;
    }
  }

  const auditRowsAfter = auditSheet ? auditSheet.getLastRow() : auditRowsBefore;
  const appendOnlyAuditRows = Math.max(0, auditRowsAfter - auditRowsBefore);
  const overallStatus = assertionPassed && cleanupVerified ? 'PASS' : 'FAIL';
  const report = {
    suite: 'root-source-approval-round-trip',
    classification: 'mutation',
    target: { fileId: fileId, sheet: DMSC_APP_CONFIG.sourceLibrarySheetName },
    startedAt: startedAt,
    finishedAt: new Date(),
    overallStatus: overallStatus,
    assertionPassed: assertionPassed,
    mutations: mutations,
    cleanup: {
      required: true,
      attempted: cleanupAttempted,
      verified: cleanupVerified,
      error: cleanupError
    },
    remainingSideEffects: appendOnlyAuditRows
      ? ['Append-only audit rows created: ' + appendOnlyAuditRows]
      : [],
    appendOnlyAuditRows: appendOnlyAuditRows
  };

  Logger.log(JSON.stringify(report, null, 2));
  if (overallStatus !== 'PASS') {
    throw new Error('Authorized live smoke failed: ' + JSON.stringify(report));
  }
  return report;
}

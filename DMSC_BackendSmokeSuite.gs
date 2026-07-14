/**
 * DMSC backend smoke suite.
 *
 * Purpose:
 * - Runs 20 backend checks in one Apps Script execution.
 * - Verifies read path, enrichment, queues, detail lookup, safe writes,
 *   unsafe-write blocking, and audit logging.
 *
 * Safety boundary:
 * - This test only writes to safe editable dashboard routing fields.
 * - It intentionally attempts unsafe writes and verifies they are ignored.
 * - It does not approve assets, change source status, change Drive files,
 *   scan Drive, merge metadata, or mutate classroom-readiness status.
 */
function runDmscBackendSmokeSuite() {
  const startedAt = new Date();
  const results = [];

  function check(name, fn) {
    try {
      const details = fn();
      results.push({
        name: name,
        status: 'PASS',
        details: details || ''
      });
    } catch (error) {
      results.push({
        name: name,
        status: 'FAIL',
        details: error && error.message ? error.message : String(error)
      });
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function assertText(value, message) {
    assert(String(value || '').trim() !== '', message);
  }

  let ss;
  let bootstrap;
  let summary;
  let page;
  let first;
  let detailBefore;
  let writeResult;
  let detailAfterSafeWrite;
  let detailAfterUnsafeWrite;
  let duplicateQueue;
  let missingIdentityQueue;
  let noPromptQueue;
  let sourceClearanceQueue;
  let sourceLibrarySheet;
  let sourceLibraryHeaders;
  let firstSourceLibraryRecord;

  check('01 config has spreadsheet id', function() {
    assertText(DMSC_APP_CONFIG.spreadsheetId, 'Missing DMSC_APP_CONFIG.spreadsheetId.');
    return DMSC_APP_CONFIG.spreadsheetId;
  });

  check('02 spreadsheet opens', function() {
    ss = getDashboardSpreadsheet_();
    assert(ss, 'Spreadsheet did not open.');
    return ss.getName();
  });

  check('03 registry sheet exists', function() {
    const sheet = ss.getSheetByName(DMSC_APP_CONFIG.registrySheetName);
    assert(sheet, 'Missing registry sheet: ' + DMSC_APP_CONFIG.registrySheetName);
    return sheet.getName() + ' rows=' + sheet.getLastRow();
  });

  check('04 Drive Images sheet exists', function() {
    const sheet = ss.getSheetByName(DMSC_APP_CONFIG.driveImagesSheetName);
    assert(sheet, 'Missing sheet: ' + DMSC_APP_CONFIG.driveImagesSheetName);
    return sheet.getName() + ' rows=' + sheet.getLastRow();
  });

  check('05 source library sheet exists', function() {
    const sheet = ss.getSheetByName(DMSC_APP_CONFIG.sourceLibrarySheetName);
    assert(sheet, 'Missing sheet: ' + DMSC_APP_CONFIG.sourceLibrarySheetName);
    return sheet.getName() + ' rows=' + sheet.getLastRow();
  });

  check('06 bootstrap returns ok', function() {
    bootstrap = getDmscDashboardBootstrap();
    assert(bootstrap && bootstrap.ok === true, 'Bootstrap did not return ok=true.');
    return 'ok=' + bootstrap.ok;
  });

  check('07 queue definitions load', function() {
    assert(bootstrap.queues && bootstrap.queues.length >= 10, 'Expected at least 10 queues.');
    return 'queues=' + bootstrap.queues.length;
  });

  check('08 summary loads records', function() {
    summary = getDmscDashboardSummary();
    assert(summary.totalRecords > 0, 'Summary totalRecords is not positive.');
    return 'totalRecords=' + summary.totalRecords;
  });

  check('09 enriched no-prompt count is below total', function() {
    assert(summary.noPromptEvidence < summary.totalRecords, 'No-prompt count still equals or exceeds total records; enrichment may not be working.');
    return 'noPromptEvidence=' + summary.noPromptEvidence + ' of ' + summary.totalRecords;
  });

  check('10 dashboard rows endpoint returns records', function() {
    page = getDmscDashboardRows({ page: 1, pageSize: 10 });
    assert(page.ok === true, 'Rows endpoint did not return ok=true.');
    assert(page.records && page.records.length > 0, 'Rows endpoint returned no records.');
    first = page.records[0];
    return 'returned=' + page.records.length + ', total=' + page.total;
  });

  check('11 first row has file identity', function() {
    assertText(first.imageIdentityId, 'First row missing imageIdentityId.');
    assertText(first.fileId, 'First row missing fileId.');
    return first.imageIdentityId;
  });

  check('12 first row has Drive URL', function() {
    assertText(first.driveUrl, 'First row missing driveUrl.');
    return first.driveUrl;
  });

  check('13 prompt evidence enrichment works', function() {
    assert(first.promptEvidenceStatus !== 'No Prompt Evidence', 'First row still shows No Prompt Evidence.');
    return first.promptEvidenceStatus;
  });

  check('14 source enrichment returns review status', function() {
    assertText(first.sourceVerificationStatus, 'First row missing sourceVerificationStatus.');
    assert(first.sourceVerificationStatus !== 'Source Unverified', 'First row still shows Source Unverified.');
    return first.sourceVerificationStatus;
  });

  check('15 source clearance queue loads', function() {
    sourceClearanceQueue = getDmscDashboardRows({
      queueId: 'sourceClearanceNeeded',
      page: 1,
      pageSize: 25
    });
    assert(sourceClearanceQueue.total > 0, 'Expected source clearance queue to contain records.');
    return 'total=' + sourceClearanceQueue.total;
  });

  check('16 duplicate candidates queue loads', function() {
    duplicateQueue = getDmscDashboardRows({
      queueId: 'duplicateCandidates',
      page: 1,
      pageSize: 50
    });
    assert(duplicateQueue.total > 0, 'Expected duplicate candidates queue to contain records.');
    return 'total=' + duplicateQueue.total;
  });

  check('17 missing identity queue is empty or valid', function() {
    missingIdentityQueue = getDmscDashboardRows({
      queueId: 'missingIdentity',
      page: 1,
      pageSize: 25
    });
    assert(missingIdentityQueue.total >= 0, 'Missing identity queue returned invalid total.');
    return 'total=' + missingIdentityQueue.total;
  });

  check('18 detail lookup returns selected record', function() {
    detailBefore = getDmscDashboardRecord(first.imageIdentityId);
    assert(detailBefore && detailBefore.ok === true, 'Detail lookup did not return ok=true.');
    assert(detailBefore.record.imageIdentityId === first.imageIdentityId, 'Detail lookup returned a different record.');
    return detailBefore.record.fileName;
  });

  check('19 safe routing write updates allowed field', function() {
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const newReason = 'Backend smoke suite safe write at ' + stamp;

    writeResult = updateDmscReviewMetadata({
      imageIdentityId: first.imageIdentityId,
      updates: {
        'Review Reason': newReason
      }
    });

    detailAfterSafeWrite = getDmscDashboardRecord(first.imageIdentityId);

    assert(writeResult.ok === true, 'Safe write did not return ok=true.');
    assert(detailAfterSafeWrite.record.reviewReason === newReason, 'Review Reason did not update.');
    return 'changed=' + writeResult.changed + ', reviewReason=' + detailAfterSafeWrite.record.reviewReason;
  });

  check('20 unsafe fields are ignored and audit is recorded', function() {
    const before = getDmscDashboardRecord(first.imageIdentityId).record;

    const unsafeResult = updateDmscReviewMetadata({
      imageIdentityId: first.imageIdentityId,
      updates: {
        'File Name': 'UNSAFE_SHOULD_NOT_WRITE.png',
        'Drive URL': 'https://example.com/unsafe',
        'Full Path': 'UNSAFE/PATH'
      }
    });

    detailAfterUnsafeWrite = getDmscDashboardRecord(first.imageIdentityId);
    const after = detailAfterUnsafeWrite.record;

    assert(after.fileName === before.fileName, 'Unsafe File Name write was not ignored.');
    assert(after.driveUrl === before.driveUrl, 'Unsafe Drive URL write was not ignored.');
    assert(after.fullPath === before.fullPath, 'Unsafe Full Path write was not ignored.');
    assert(unsafeResult.changed === 0, 'Unsafe write reported changed fields.');
    assert(detailAfterUnsafeWrite.audit && detailAfterUnsafeWrite.audit.length > 0, 'Expected audit entries for the record.');

    return 'unsafeChanged=' + unsafeResult.changed + ', auditCount=' + detailAfterUnsafeWrite.audit.length;
  });

  check('21 source library required approval headers exist', function() {
    sourceLibrarySheet = ss.getSheetByName(DMSC_APP_CONFIG.sourceLibrarySheetName);
    assert(sourceLibrarySheet, 'Missing source library sheet.');

    sourceLibraryHeaders = sourceLibrarySheet
      .getRange(1, 1, 1, sourceLibrarySheet.getLastColumn())
      .getValues()[0]
      .map(function(header) { return String(header || '').trim(); });

    [
      'file_id',
      'drive_url',
      'file_name',
      'source_approval_status',
      'approval_evidence_url',
      'approved_by',
      'approval_date',
      'restrictions',
      'approved_prompt',
      'approved_prompt_source',
      'source_notes',
      'pilot_review_status'
    ].forEach(function(requiredHeader) {
      assert(sourceLibraryHeaders.indexOf(requiredHeader) !== -1, 'Missing source library header: ' + requiredHeader);
    });

    return 'headers=' + sourceLibraryHeaders.length;
  });

  check('22 source library contains selected asset row', function() {
    const values = sourceLibrarySheet.getDataRange().getValues();
    const headers = values[0].map(function(header) { return String(header || '').trim(); });
    const fileIdIndex = headers.indexOf('file_id');
    assert(fileIdIndex !== -1, 'Missing file_id header.');

    for (let rowIndex = 1; rowIndex < values.length; rowIndex++) {
      if (String(values[rowIndex][fileIdIndex] || '').trim() === first.fileId) {
        firstSourceLibraryRecord = {};
        headers.forEach(function(header, columnIndex) {
          firstSourceLibraryRecord[header] = values[rowIndex][columnIndex];
        });
        firstSourceLibraryRecord.__rowNumber = rowIndex + 1;
        break;
      }
    }

    assert(firstSourceLibraryRecord, 'Selected asset was not found in source library by file_id.');
    return 'row=' + firstSourceLibraryRecord.__rowNumber + ', file_id=' + firstSourceLibraryRecord.file_id;
  });

  check('23 source library approval status is not production approved', function() {
    const status = String(firstSourceLibraryRecord.source_approval_status || '').trim();
    assert(status !== 'Approved', 'Selected asset is already marked Approved; smoke test expects pilot/unapproved source state.');
    return status || '(blank)';
  });

  check('24 source library production approval evidence is not present', function() {
    const status = String(firstSourceLibraryRecord.source_approval_status || '').trim();
    const evidence = String(firstSourceLibraryRecord.approval_evidence_url || '').trim();
    const approvalDate = String(firstSourceLibraryRecord.approval_date || '').trim();

    assert(status !== 'Approved', 'Selected asset is marked Approved; expected pilot/non-production source state.');
    assert(!evidence, 'Selected asset has approval_evidence_url; expected no production approval evidence during pilot.');
    assert(!approvalDate, 'Selected asset has approval_date; expected no production approval date during pilot.');

    return 'status=' + (status || '(blank)') + ', production evidence absent';
  });

  check('25 source clearance remains blocked until approval workflow exists', function() {
    const current = getDmscDashboardRecord(first.imageIdentityId).record;

    assert(current.sourceControlClearanceNeeded === 'Yes', 'Expected sourceControlClearanceNeeded=Yes.');
    assert(current.sourceVerificationStatus === 'Source Review Needed', 'Expected Source Review Needed.');
    assert(sourceClearanceQueue.total === summary.totalRecords, 'Expected all records to remain in source clearance queue.');

    return 'sourceControlClearanceNeeded=' + current.sourceControlClearanceNeeded + ', sourceVerificationStatus=' + current.sourceVerificationStatus;
  });

  const passed = results.filter(function(result) { return result.status === 'PASS'; }).length;
  const failed = results.filter(function(result) { return result.status === 'FAIL'; }).length;

  const report = {
    suite: 'DMSC Backend Smoke Suite',
    startedAt: startedAt,
    finishedAt: new Date(),
    passed: passed,
    failed: failed,
    total: results.length,
    overallStatus: failed === 0 ? 'PASS' : 'FAIL',
    results: results
  };

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

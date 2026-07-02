function runVamUniversalSmokeTest() {
  return runVamSmokeTestSuite_(getVamSmokeTestRegistry_());
}

function runVamTenFunctionSmokeTest() {
  return runVamUniversalSmokeTest();
}

function getVamSmokeTestRegistry_() {
  return [
    { id: 'feature.registry.summary', label: 'Feature Registry Summary', area: 'Feature Registry', handler: 'getVamFeatureRegistrySummary', mode: 'read', enabled: true },
    { id: 'feature.registry.unavailable', label: 'Unavailable Features', area: 'Feature Registry', handler: 'getUnavailableVamFeatures', mode: 'read', enabled: true },
    { id: 'feature.registry.guarded', label: 'Guarded Features', area: 'Feature Registry', handler: 'getGuardedVamFeatures', mode: 'read', enabled: true },
    { id: 'feature.explorer.refresh', label: 'Refresh Feature Explorer', area: 'Feature Explorer', handler: 'refreshVamFeatureExplorer', mode: 'sheet-write', enabled: true },
    { id: 'top5.preview.all', label: 'Top 5 Cleanup Preview', area: 'Top 5 Cleanup', handler: 'getVamTopFiveCleanupPreview', mode: 'read', enabled: true },
    { id: 'top5.preview.course', label: 'Course Cleanup Preview', area: 'Top 5 Cleanup', handler: 'getVamCourseCleanupPreview', mode: 'read', enabled: true },
    { id: 'top5.preview.metadataStatus', label: 'Metadata Status Cleanup Preview', area: 'Top 5 Cleanup', handler: 'getVamMetadataStatusCleanupPreview', mode: 'read', enabled: true },
    { id: 'top5.preview.exactFileIdVerified', label: 'Exact File ID Verified Preview', area: 'Top 5 Cleanup', handler: 'getVamExactFileIdVerifiedCleanupPreview', mode: 'read', enabled: true },
    { id: 'validation.missingRequired', label: 'Missing Required Fields', area: 'Validation', handler: 'getVisualAssetMissingRequiredFields', mode: 'read', enabled: true },
    { id: 'validation.driveFileId', label: 'Drive File ID Suggestions', area: 'Validation', handler: 'getVisualAssetDriveFileIdSuggestions', mode: 'read', enabled: true }
  ];
}

function runVamSmokeTestSuite_(registry) {
  const tests = registry.filter(function(test) { return test.enabled !== false; });
  const results = tests.map(function(test) { return runVamSmokeTest_(test); });
  writeVamSmokeTestResults_(results);

  const passed = results.filter(function(row) { return row.status === 'PASS'; }).length;
  Logger.log('[VAM_SMOKE] Complete | Passed: ' + passed + ' | Failed: ' + (results.length - passed) + ' | Total: ' + results.length);

  return { total: results.length, passed: passed, failed: results.length - passed, resultSheetName: 'Function Test Results' };
}

function runVamSmokeTest_(test) {
  const started = new Date().getTime();
  try {
    const fn = globalThis[test.handler];
    if (typeof fn !== 'function') throw new Error('Function not found: ' + test.handler);
    const value = fn();
    return {
      id: test.id, label: test.label, area: test.area, handler: test.handler, mode: test.mode,
      status: 'PASS', resultType: getVamSmokeResultType_(value), resultCount: getVamSmokeResultCount_(value),
      durationMs: new Date().getTime() - started, message: getVamSmokeResultSummary_(value)
    };
  } catch (error) {
    return {
      id: test.id, label: test.label, area: test.area, handler: test.handler, mode: test.mode,
      status: 'FAIL', resultType: 'error', resultCount: 0,
      durationMs: new Date().getTime() - started, message: String(error && error.message ? error.message : error)
    };
  }
}

function writeVamSmokeTestResults_(results) {
  const spreadsheet = getVamSmokeSpreadsheet_();
  const sheet = spreadsheet.getSheetByName('Function Test Results') || spreadsheet.insertSheet('Function Test Results');
  const passed = results.filter(function(row) { return row.status === 'PASS'; }).length;
  const rows = [
    ['Universal Smoke Test Results', '', '', '', '', '', '', '', '', ''],
    ['Generated At', new Date(), '', '', '', '', '', '', '', ''],
    ['Total Tests', results.length, 'Passed', passed, 'Failed', results.length - passed, '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', ''],
    ['Test ID', 'Label', 'Area', 'Handler', 'Mode', 'Status', 'Result Type', 'Result Count', 'Duration Ms', 'Message']
  ].concat(results.map(function(row) {
    return [row.id, row.label, row.area, row.handler, row.mode, row.status, row.resultType, row.resultCount, row.durationMs, row.message];
  }));

  sheet.clear();
  sheet.getRange(1, 1, rows.length, 10).setValues(rows);

  const existingFilter = sheet.getFilter();
  if (existingFilter) existingFilter.remove();

  sheet.setFrozenRows(5);
  sheet.getRange(1, 1, 1, 10).setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange(5, 1, 1, 10).setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange(5, 1, rows.length - 4, 10).createFilter();
  sheet.autoResizeColumns(1, 9);
  sheet.setColumnWidth(10, 520);
}

function getVamSmokeSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  if (typeof VAM_CONFIG !== 'undefined' && VAM_CONFIG.spreadsheetId) return SpreadsheetApp.openById(VAM_CONFIG.spreadsheetId);
  if (typeof VAM_GOV_CONFIG !== 'undefined' && VAM_GOV_CONFIG.spreadsheetId) return SpreadsheetApp.openById(VAM_GOV_CONFIG.spreadsheetId);
  if (typeof DMSC_APP_CONFIG !== 'undefined' && DMSC_APP_CONFIG.spreadsheetId) return SpreadsheetApp.openById(DMSC_APP_CONFIG.spreadsheetId);
  throw new Error('No active spreadsheet or configured spreadsheetId found.');
}

function getVamSmokeResultType_(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function getVamSmokeResultCount_(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') {
    if (typeof value.featureCount === 'number') return value.featureCount;
    if (typeof value.issueRows === 'number') return value.issueRows;
    if (typeof value.total === 'number') return value.total;
    return Object.keys(value).length;
  }
  return value ? 1 : 0;
}

function getVamSmokeResultSummary_(value) {
  if (Array.isArray(value)) return 'Array count: ' + value.length;
  if (value && typeof value === 'object') {
    return Object.keys(value).slice(0, 8).map(function(key) {
      return key + '=' + value[key];
    }).join(' | ');
  }
  return String(value);
}

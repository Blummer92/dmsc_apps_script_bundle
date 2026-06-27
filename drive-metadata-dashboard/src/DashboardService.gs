var DriveMetadataDashboardService = (function() {
  function buildDashboard() {
    const config = getRuntimeConfig();
    const warnings = [];
    const metadataRead = SheetReadService.readRecords(config.dashboardSpreadsheetId, config.metadataSheetName, Math.min(config.resultLimit, APP_CONFIG.MAX_ROWS_TO_READ));
    warnings.push.apply(warnings, metadataRead.warnings);
    const sourceRead = config.sourceLibrarySpreadsheetId ? SheetReadService.readRecords(config.sourceLibrarySpreadsheetId, config.sourceLibrarySheetName, APP_CONFIG.MAX_ROWS_TO_READ) : { records: [], warnings: ['DM Source Library spreadsheet ID is not configured. Source approval summary is limited to indexed row fields.'], headers: [] };
    warnings.push.apply(warnings, sourceRead.warnings);
    const duplicateGroups = GovernanceService.buildDuplicateGroups(metadataRead.records);
    const records = GovernanceService.enrichRecords(metadataRead.records, sourceRead.records);
    const summary = GovernanceService.summarize(records, duplicateGroups, warnings, config);
    const handoffText = HandoffService.buildHandoffText(records, duplicateGroups, summary);
    return {
      readOnly: true,
      configStatus: {
        metadataSheetName: config.metadataSheetName,
        sourceLibrarySheetName: config.sourceLibrarySheetName,
        hasSourceLibrarySpreadsheet: Boolean(config.sourceLibrarySpreadsheetId)
      },
      summary: summary,
      records: records,
      duplicateCandidateGroups: duplicateGroups,
      handoffText: handoffText,
      forbiddenActions: ['source approval', 'DM Source Library writes', 'Notion writes', 'Drive file edits', 'Google Sheets row edits', 'duplicate merge', 'prompt overwrite', 'eligibility promotion', 'readiness updates', 'blocked-record export', 'record creation or deletion']
    };
  }
  return { buildDashboard: buildDashboard };
})();

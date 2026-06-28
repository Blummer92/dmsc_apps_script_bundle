var DriveMetadataDashboardService = (function() {
  function buildDashboard() {
    const config = getRuntimeConfig();
    const warnings = [];

    const metadataRead = SheetReadService.readConfiguredOrActiveRecords(
      config.dashboardSpreadsheetId,
      config.metadataSheetName,
      Math.min(config.resultLimit, APP_CONFIG.MAX_ROWS_TO_READ)
    );

    warnings.push.apply(warnings, metadataRead.warnings);

    let sourceRead = {
      records: [],
      warnings: ['DM Source Library spreadsheet ID is not configured. Source approval summary is limited to mirrored dashboard row fields.'],
      headers: []
    };

    if (config.sourceLibrarySpreadsheetId) {
      sourceRead = SheetReadService.readRecords(
        config.sourceLibrarySpreadsheetId,
        config.sourceLibrarySheetName,
        APP_CONFIG.MAX_ROWS_TO_READ
      );
    }

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
        hasDashboardSpreadsheetId: Boolean(config.dashboardSpreadsheetId),
        hasSourceLibrarySpreadsheet: Boolean(config.sourceLibrarySpreadsheetId)
      },
      summary: summary,
      records: records,
      duplicateCandidateGroups: duplicateGroups,
      handoffText: handoffText,
      forbiddenActions: []
    };
  }

  return { buildDashboard: buildDashboard };
})();

var GovernanceService = (function() {
  function enrichRecords(records) {
    return (records || []).map(function(record) {
      return {
        rowNumber: record.rowNumber,
        fileName: record.file_name || record.name || '',
        fileId: record.file_id || '',
        driveUrl: record.drive_url || '',
        fullPath: record.full_path || '',
        reviewTier: record.review_tier || 'Invalid Tier',
        validationWarnings: [],
        duplicateCandidateKey: '',
        unresolvedDuplicate: false,
        blocked: record.review_tier === 'Tier 4',
        blockedReason: '',
        computedExportEligible: false,
        computedGenerationEligible: false,
        sourceApproval: {},
        prompts: {},
        metadata: {}
      };
    });
  }
  function summarize(records, duplicateGroups, warnings, config) {
    return { connectedSheetName: config.metadataSheetName, totalRecords: records.length, warnings: warnings || [], readOnly: true, tierCounts: { tier1: 0, tier2: 0, tier3: 0, tier4: 0, invalid: records.length }, missingMetadataCount: 0, duplicateCandidateCount: 0, duplicateGroupCount: duplicateGroups.length, blockedCount: 0, exportEligibleCount: 0, generationEligibleCount: 0, lastScanPreviewAt: new Date().toISOString() };
  }
  function buildDuplicateGroups(records) { return []; }
  return { enrichRecords: enrichRecords, summarize: summarize, buildDuplicateGroups: buildDuplicateGroups };
})();

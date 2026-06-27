var HandoffService = (function() {
  function buildHandoffText(records, duplicateGroups, summary) {
    const blockedRecords = records.filter(function(record) { return record.blocked; });
    const exportEligible = records.filter(function(record) { return record.computedExportEligible; });
    return [
      'Drive Metadata Dashboard Handoff Preview',
      '',
      'Read-only status: ON',
      'Total records reviewed in current view: ' + summary.totalRecords,
      'Computed export eligible: ' + exportEligible.length,
      'Blocked records: ' + blockedRecords.length,
      'Duplicate candidate groups: ' + duplicateGroups.length,
      '',
      'Governance reminder:',
      '- This handoff preview does not approve sources.',
      '- This handoff preview does not export blocked records.',
      '- This handoff preview does not update DM Source Library, Notion, Drive, Sheets, dashboards, or curriculum readiness.'
    ].join('\n');
  }
  return { buildHandoffText: buildHandoffText };
})();

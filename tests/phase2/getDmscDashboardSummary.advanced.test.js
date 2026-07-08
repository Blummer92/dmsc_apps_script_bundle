/**
 * Dashboard Summary: Advanced cases
 * Tests: Duplicate group counting, timestamps, real-world scenarios
 */

describe('getDmscDashboardSummary() - Advanced', () => {
  function getDmscDashboardSummary(rows) {
    const summary = {
      totalRecords: rows.length,
      humanReviewRequired: 0,
      sourceClearanceNeeded: 0,
      noPromptEvidence: 0,
      duplicateGroups: 0,
      missingDriveIdentity: 0,
      visualAssetReview: 0,
      instructionalBlocked: 0,
      strongEvidence: 0,
      lastSync: ''
    };

    const duplicateGroups = {};
    rows.forEach((record) => {
      if (String(record['Human Review Required'] || '').trim() === 'Yes') summary.humanReviewRequired++;
      if (String(record['Source Verification Status'] || '').trim() === 'Needed') summary.sourceClearanceNeeded++;
      if (String(record['Prompt Evidence Status'] || '').trim() === 'No Prompt Evidence') summary.noPromptEvidence++;
      if (String(record['Next Owner'] || '').trim() === 'Visual Asset Director') summary.visualAssetReview++;
      if (String(record['Instructional Blocked'] || '').trim() === 'Yes') summary.instructionalBlocked++;
      if (String(record['Strong Evidence'] || '').trim() === 'Yes') summary.strongEvidence++;
      if (!String(record['File ID'] || '').trim()) summary.missingDriveIdentity++;

      const dup = String(record['Duplicate Group'] || '').trim();
      if (dup) duplicateGroups[dup] = true;

      const sync = String(record['Last Metadata Sync Timestamp'] || '').trim();
      if (sync && (!summary.lastSync || sync > summary.lastSync)) summary.lastSync = sync;
    });

    summary.duplicateGroups = Object.keys(duplicateGroups).length;
    return summary;
  }

  describe('Duplicate Groups - Unique Count', () => {
    test('counts only unique groups', () => {
      const rows = [
        { 'Duplicate Group': 'group-1' },
        { 'Duplicate Group': 'group-1' },
        { 'Duplicate Group': 'group-2' },
        { 'Duplicate Group': '' }
      ];
      expect(getDmscDashboardSummary(rows).duplicateGroups).toBe(2);
    });

    test('ignores empty groups', () => {
      const rows = [
        { 'Duplicate Group': 'group-1' },
        { 'Duplicate Group': null },
        { 'Duplicate Group': '' }
      ];
      expect(getDmscDashboardSummary(rows).duplicateGroups).toBe(1);
    });

    test('ignores whitespace-only groups', () => {
      const rows = [
        { 'Duplicate Group': 'group-1' },
        { 'Duplicate Group': '   ' }
      ];
      expect(getDmscDashboardSummary(rows).duplicateGroups).toBe(1);
    });
  });

  describe('Last Sync Timestamp', () => {
    test('identifies most recent', () => {
      const rows = [
        { 'Last Metadata Sync Timestamp': '2024-01-10T10:00:00Z' },
        { 'Last Metadata Sync Timestamp': '2024-01-15T14:30:00Z' },
        { 'Last Metadata Sync Timestamp': '2024-01-12T12:00:00Z' }
      ];
      expect(getDmscDashboardSummary(rows).lastSync).toBe('2024-01-15T14:30:00Z');
    });

    test('ignores empty timestamps', () => {
      const rows = [
        { 'Last Metadata Sync Timestamp': '2024-01-10T10:00:00Z' },
        { 'Last Metadata Sync Timestamp': '' },
        { 'Last Metadata Sync Timestamp': null }
      ];
      expect(getDmscDashboardSummary(rows).lastSync).toBe('2024-01-10T10:00:00Z');
    });

    test('returns empty when no timestamps', () => {
      const rows = [
        { 'Last Metadata Sync Timestamp': '' },
        { 'Last Metadata Sync Timestamp': null }
      ];
      expect(getDmscDashboardSummary(rows).lastSync).toBe('');
    });
  });

  describe('Real-World Scenarios', () => {
    test('mixed records with all metrics', () => {
      const rows = [
        {
          'Human Review Required': 'Yes',
          'Source Verification Status': 'Needed',
          'Prompt Evidence Status': 'No Prompt Evidence',
          'Duplicate Group': 'dup-1',
          'File ID': 'file-1',
          'Next Owner': 'Visual Asset Director',
          'Instructional Blocked': 'Yes',
          'Strong Evidence': 'No',
          'Last Metadata Sync Timestamp': '2024-01-10T10:00:00Z'
        },
        {
          'Human Review Required': 'No',
          'Source Verification Status': 'Verified',
          'Prompt Evidence Status': 'Strong Evidence',
          'Duplicate Group': 'dup-1',
          'File ID': '',
          'Next Owner': 'Content Team',
          'Instructional Blocked': 'No',
          'Strong Evidence': 'Yes',
          'Last Metadata Sync Timestamp': '2024-01-15T14:30:00Z'
        }
      ];

      const summary = getDmscDashboardSummary(rows);
      expect(summary.totalRecords).toBe(2);
      expect(summary.humanReviewRequired).toBe(1);
      expect(summary.sourceClearanceNeeded).toBe(1);
      expect(summary.noPromptEvidence).toBe(1);
      expect(summary.duplicateGroups).toBe(1);
      expect(summary.missingDriveIdentity).toBe(1);
      expect(summary.visualAssetReview).toBe(1);
      expect(summary.instructionalBlocked).toBe(1);
      expect(summary.strongEvidence).toBe(1);
      expect(summary.lastSync).toBe('2024-01-15T14:30:00Z');
    });

    test('all empty values', () => {
      const rows = [{
        'Human Review Required': '',
        'Source Verification Status': '',
        'Prompt Evidence Status': '',
        'Duplicate Group': '',
        'File ID': '',
        'Next Owner': '',
        'Instructional Blocked': '',
        'Strong Evidence': '',
        'Last Metadata Sync Timestamp': ''
      }];

      const summary = getDmscDashboardSummary(rows);
      expect(summary.totalRecords).toBe(1);
      expect(summary.humanReviewRequired).toBe(0);
      expect(summary.missingDriveIdentity).toBe(1);
      expect(summary.lastSync).toBe('');
    });
  });
});

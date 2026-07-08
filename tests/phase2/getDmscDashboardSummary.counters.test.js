/**
 * Dashboard Summary: Individual counter tests
 * Tests each of the 8 summary metrics independently
 */

describe('getDmscDashboardSummary() - Individual Counters', () => {
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

  describe('Total Records', () => {
    test('counts correctly', () => {
      const result = getDmscDashboardSummary([{ id: '1' }, { id: '2' }, { id: '3' }]);
      expect(result.totalRecords).toBe(3);
    });

    test('handles empty list', () => {
      const result = getDmscDashboardSummary([]);
      expect(result.totalRecords).toBe(0);
    });
  });

  describe('Human Review Required', () => {
    test('counts "Yes" values', () => {
      const rows = [
        { 'Human Review Required': 'Yes' },
        { 'Human Review Required': 'Yes' },
        { 'Human Review Required': 'No' }
      ];
      expect(getDmscDashboardSummary(rows).humanReviewRequired).toBe(2);
    });

    test('ignores empty values', () => {
      const rows = [
        { 'Human Review Required': 'Yes' },
        { 'Human Review Required': '' },
        { 'Human Review Required': null }
      ];
      expect(getDmscDashboardSummary(rows).humanReviewRequired).toBe(1);
    });
  });

  describe('Source Clearance Needed', () => {
    test('counts "Needed" status', () => {
      const rows = [
        { 'Source Verification Status': 'Needed' },
        { 'Source Verification Status': 'Verified' },
        { 'Source Verification Status': 'Needed' }
      ];
      expect(getDmscDashboardSummary(rows).sourceClearanceNeeded).toBe(2);
    });
  });

  describe('No Prompt Evidence', () => {
    test('counts exact match only', () => {
      const rows = [
        { 'Prompt Evidence Status': 'No Prompt Evidence' },
        { 'Prompt Evidence Status': 'Weak Evidence' },
        { 'Prompt Evidence Status': 'Strong Evidence' }
      ];
      expect(getDmscDashboardSummary(rows).noPromptEvidence).toBe(1);
    });
  });

  describe('Missing Drive Identity', () => {
    test('counts empty File ID', () => {
      const rows = [
        { 'File ID': 'file-123' },
        { 'File ID': '' },
        { 'File ID': null }
      ];
      expect(getDmscDashboardSummary(rows).missingDriveIdentity).toBe(2);
    });
  });

  describe('Visual Asset Review', () => {
    test('counts Visual Asset Director owner', () => {
      const rows = [
        { 'Next Owner': 'Visual Asset Director' },
        { 'Next Owner': 'Content Team' },
        { 'Next Owner': 'Visual Asset Director' }
      ];
      expect(getDmscDashboardSummary(rows).visualAssetReview).toBe(2);
    });
  });

  describe('Instructional Blocked', () => {
    test('counts "Yes" values', () => {
      const rows = [
        { 'Instructional Blocked': 'Yes' },
        { 'Instructional Blocked': 'No' },
        { 'Instructional Blocked': 'Yes' }
      ];
      expect(getDmscDashboardSummary(rows).instructionalBlocked).toBe(2);
    });
  });

  describe('Strong Evidence', () => {
    test('counts "Yes" values', () => {
      const rows = [
        { 'Strong Evidence': 'Yes' },
        { 'Strong Evidence': 'No' },
        { 'Strong Evidence': 'Yes' }
      ];
      expect(getDmscDashboardSummary(rows).strongEvidence).toBe(2);
    });
  });
});

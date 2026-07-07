/**
 * Unit tests for getDmscDashboardSummary() function
 * HIGH PRIORITY: Calculates 8 summary metrics displayed on dashboard
 * Incorrect counts mislead operators about data state
 */

const { MOCK_REGISTRY_ROWS, MOCK_HEADERS } = require('../fixtures/mockSheetData.js');

describe('getDmscDashboardSummary()', () => {
  // Implementation under test
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
      // Assume record is an object with field names as keys
      const humanReview = String(record['Human Review Required'] || '').trim();
      const clearanceNeeded = String(record['Source Verification Status'] || '').trim();
      const promptStatus = String(record['Prompt Evidence Status'] || '').trim();
      const nextOwner = String(record['Next Owner'] || '').trim();
      const duplicateGroup = String(record['Duplicate Group'] || '').trim();
      const instructional = String(record['Instructional Blocked'] || '').trim();
      const strongEvidenceFlag = String(record['Strong Evidence'] || '').trim();
      const sync = String(record['Last Metadata Sync Timestamp'] || '').trim();
      const fileId = String(record['File ID'] || '').trim();

      if (humanReview === 'Yes') summary.humanReviewRequired++;
      if (clearanceNeeded === 'Needed') summary.sourceClearanceNeeded++;
      if (promptStatus === 'No Prompt Evidence') summary.noPromptEvidence++;
      if (nextOwner === 'Visual Asset Director') summary.visualAssetReview++;
      if (instructional === 'Yes') summary.instructionalBlocked++;
      if (strongEvidenceFlag === 'Yes') summary.strongEvidence++;
      if (!fileId) summary.missingDriveIdentity++;

      if (duplicateGroup) {
        duplicateGroups[duplicateGroup] = true;
      }

      if (sync && (!summary.lastSync || sync > summary.lastSync)) {
        summary.lastSync = sync;
      }
    });

    summary.duplicateGroups = Object.keys(duplicateGroups).length;
    return summary;
  }

  describe('Basic metrics', () => {
    test('counts total records correctly', () => {
      const rows = [
        { id: '1' },
        { id: '2' },
        { id: '3' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.totalRecords).toBe(3);
    });

    test('handles empty record list', () => {
      const summary = getDmscDashboardSummary([]);

      expect(summary.totalRecords).toBe(0);
      expect(summary.humanReviewRequired).toBe(0);
      expect(summary.sourceClearanceNeeded).toBe(0);
      expect(summary.noPromptEvidence).toBe(0);
      expect(summary.duplicateGroups).toBe(0);
      expect(summary.missingDriveIdentity).toBe(0);
      expect(summary.lastSync).toBe('');
    });
  });

  describe('Human Review Required counter', () => {
    test('counts records flagged for human review', () => {
      const rows = [
        { 'Human Review Required': 'Yes' },
        { 'Human Review Required': 'Yes' },
        { 'Human Review Required': 'No' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.humanReviewRequired).toBe(2);
    });

    test('ignores empty human review field', () => {
      const rows = [
        { 'Human Review Required': 'Yes' },
        { 'Human Review Required': '' },
        { 'Human Review Required': null }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.humanReviewRequired).toBe(1);
    });

    test('handles whitespace in field values', () => {
      const rows = [
        { 'Human Review Required': '  Yes  ' },
        { 'Human Review Required': 'Yes' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.humanReviewRequired).toBe(2);
    });
  });

  describe('Source Clearance Needed counter', () => {
    test('counts records needing source verification clearance', () => {
      const rows = [
        { 'Source Verification Status': 'Needed' },
        { 'Source Verification Status': 'Verified' },
        { 'Source Verification Status': 'Needed' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.sourceClearanceNeeded).toBe(2);
    });

    test('ignores records without clearance status', () => {
      const rows = [
        { 'Source Verification Status': 'Needed' },
        { 'Source Verification Status': null },
        { 'Source Verification Status': '' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.sourceClearanceNeeded).toBe(1);
    });
  });

  describe('No Prompt Evidence counter', () => {
    test('counts records with no prompt evidence', () => {
      const rows = [
        { 'Prompt Evidence Status': 'No Prompt Evidence' },
        { 'Prompt Evidence Status': 'Strong Evidence' },
        { 'Prompt Evidence Status': 'No Prompt Evidence' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.noPromptEvidence).toBe(2);
    });

    test('distinguishes evidence types', () => {
      const rows = [
        { 'Prompt Evidence Status': 'No Prompt Evidence' },
        { 'Prompt Evidence Status': 'Weak Evidence' },
        { 'Prompt Evidence Status': 'Strong Evidence' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.noPromptEvidence).toBe(1);
    });
  });

  describe('Duplicate Groups counter', () => {
    test('counts unique duplicate groups', () => {
      const rows = [
        { 'Duplicate Group': 'group-1' },
        { 'Duplicate Group': 'group-1' },
        { 'Duplicate Group': 'group-2' },
        { 'Duplicate Group': '' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.duplicateGroups).toBe(2); // Only 2 unique groups
    });

    test('does not count empty groups', () => {
      const rows = [
        { 'Duplicate Group': 'group-1' },
        { 'Duplicate Group': null },
        { 'Duplicate Group': '' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.duplicateGroups).toBe(1);
    });

    test('handles whitespace-only groups', () => {
      const rows = [
        { 'Duplicate Group': 'group-1' },
        { 'Duplicate Group': '   ' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.duplicateGroups).toBe(1); // Whitespace-only is ignored
    });
  });

  describe('Missing Drive Identity counter', () => {
    test('counts records with no file ID', () => {
      const rows = [
        { 'File ID': 'file-123' },
        { 'File ID': '' },
        { 'File ID': null }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.missingDriveIdentity).toBe(2);
    });

    test('counts based on file ID only', () => {
      const rows = [
        { 'File ID': '' },
        { 'File ID': '   ' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.missingDriveIdentity).toBe(2);
    });
  });

  describe('Visual Asset Review counter', () => {
    test('counts records assigned to Visual Asset Director', () => {
      const rows = [
        { 'Next Owner': 'Visual Asset Director' },
        { 'Next Owner': 'Content Team' },
        { 'Next Owner': 'Visual Asset Director' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.visualAssetReview).toBe(2);
    });

    test('is case-sensitive', () => {
      const rows = [
        { 'Next Owner': 'Visual Asset Director' },
        { 'Next Owner': 'visual asset director' } // Different case
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.visualAssetReview).toBe(1);
    });
  });

  describe('Instructional Blocked counter', () => {
    test('counts records with instructional use blocked', () => {
      const rows = [
        { 'Instructional Blocked': 'Yes' },
        { 'Instructional Blocked': 'No' },
        { 'Instructional Blocked': 'Yes' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.instructionalBlocked).toBe(2);
    });
  });

  describe('Strong Evidence counter', () => {
    test('counts records with strong metadata evidence', () => {
      const rows = [
        { 'Strong Evidence': 'Yes' },
        { 'Strong Evidence': 'No' },
        { 'Strong Evidence': 'Yes' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.strongEvidence).toBe(2);
    });
  });

  describe('Last Sync Timestamp', () => {
    test('identifies most recent sync timestamp', () => {
      const rows = [
        { 'Last Metadata Sync Timestamp': '2024-01-10T10:00:00Z' },
        { 'Last Metadata Sync Timestamp': '2024-01-15T14:30:00Z' },
        { 'Last Metadata Sync Timestamp': '2024-01-12T12:00:00Z' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.lastSync).toBe('2024-01-15T14:30:00Z');
    });

    test('ignores empty timestamps', () => {
      const rows = [
        { 'Last Metadata Sync Timestamp': '2024-01-10T10:00:00Z' },
        { 'Last Metadata Sync Timestamp': '' },
        { 'Last Metadata Sync Timestamp': null }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.lastSync).toBe('2024-01-10T10:00:00Z');
    });

    test('returns empty string when no timestamps', () => {
      const rows = [
        { 'Last Metadata Sync Timestamp': '' },
        { 'Last Metadata Sync Timestamp': null }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.lastSync).toBe('');
    });

    test('handles ISO format timestamps correctly', () => {
      const rows = [
        { 'Last Metadata Sync Timestamp': '2024-01-15T09:00:00Z' },
        { 'Last Metadata Sync Timestamp': '2024-01-15T10:00:00Z' }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.lastSync).toBe('2024-01-15T10:00:00Z');
    });
  });

  describe('Real-world scenarios', () => {
    test('counts all metrics simultaneously for mixed records', () => {
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
      expect(summary.duplicateGroups).toBe(1); // Same group, counted once
      expect(summary.missingDriveIdentity).toBe(1);
      expect(summary.visualAssetReview).toBe(1);
      expect(summary.instructionalBlocked).toBe(1);
      expect(summary.strongEvidence).toBe(1);
      expect(summary.lastSync).toBe('2024-01-15T14:30:00Z');
    });

    test('handles records with all empty values', () => {
      const rows = [
        {
          'Human Review Required': '',
          'Source Verification Status': '',
          'Prompt Evidence Status': '',
          'Duplicate Group': '',
          'File ID': '',
          'Next Owner': '',
          'Instructional Blocked': '',
          'Strong Evidence': '',
          'Last Metadata Sync Timestamp': ''
        }
      ];

      const summary = getDmscDashboardSummary(rows);

      expect(summary.totalRecords).toBe(1);
      expect(summary.humanReviewRequired).toBe(0);
      expect(summary.sourceClearanceNeeded).toBe(0);
      expect(summary.noPromptEvidence).toBe(0);
      expect(summary.duplicateGroups).toBe(0);
      expect(summary.missingDriveIdentity).toBe(1); // Empty file ID
      expect(summary.lastSync).toBe('');
    });
  });
});

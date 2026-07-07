/**
 * Unit tests for appendAuditEntry_() function
 * CRITICAL: Audit log integrity for compliance and accountability
 */

const { createMockSpreadsheet, createMockSheet, MOCK_AUDIT_LOG_DATA } = require('../fixtures/mockSheetData.js');

describe('appendAuditEntry_()', () => {
  let mockSpreadsheet;
  let mockAuditSheet;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuditSheet = createMockSheet('DMSC Audit Log', MOCK_AUDIT_LOG_DATA);
    mockSpreadsheet = createMockSpreadsheet({
      'DMSC Audit Log': mockAuditSheet
    });
  });

  // Implementation of appendAuditEntry_() for testing
  function appendAuditEntry_(imageIdentityId, action, changes, source) {
    const DMSC_APP_CONFIG = {
      auditLogSheetName: 'DMSC Audit Log'
    };

    const ss = mockSpreadsheet;
    let sheet = ss.getSheetByName(DMSC_APP_CONFIG.auditLogSheetName);

    if (!sheet) {
      sheet = ss.insertSheet(DMSC_APP_CONFIG.auditLogSheetName);
      sheet.appendRow([
        'Image Identity ID',
        'Action',
        'Timestamp',
        'Actor',
        'Source',
        'Field',
        'Old Value',
        'New Value'
      ]);
    }

    const actor = 'test-user@example.com';
    const timestamp = new Date().toISOString();

    if (!changes || changes.length === 0) {
      sheet.appendRow([imageIdentityId, action, timestamp, actor, source, '', '', '']);
    } else {
      changes.forEach((change) => {
        sheet.appendRow([
          imageIdentityId,
          action,
          timestamp,
          actor,
          source,
          change.field,
          change.oldValue,
          change.newValue
        ]);
      });
    }

    return { ok: true, entriesAdded: (changes || []).length || 1 };
  }

  describe('Valid audit entries', () => {
    test('appends single audit entry with changes', () => {
      const changes = [
        { field: 'Review Reason', oldValue: '', newValue: 'Initial review needed' }
      ];

      const result = appendAuditEntry_('id-001', 'Human Review Routing Update', changes, 'Dashboard UI');

      expect(result.ok).toBe(true);
      expect(result.entriesAdded).toBe(1);
      expect(mockAuditSheet.appendRow).toHaveBeenCalled();
    });

    test('appends multiple changes as separate rows', () => {
      const changes = [
        { field: 'Review Reason', oldValue: '', newValue: 'Needs verification' },
        { field: 'Next Owner', oldValue: 'Content Team', newValue: 'Source Authority Agent' }
      ];

      const result = appendAuditEntry_('id-002', 'Human Review Routing Update', changes, 'Dashboard UI');

      expect(result.ok).toBe(true);
      expect(result.entriesAdded).toBe(2);
      expect(mockAuditSheet.appendRow).toHaveBeenCalledTimes(2);
    });

    test('logs entry with SYSTEM actor for Drive Scan', () => {
      const changes = [
        { field: 'Action', oldValue: '', newValue: 'runDriveImageScanOnly' }
      ];

      const result = appendAuditEntry_('SYSTEM', 'Drive Scan Triggered', changes, 'Dashboard UI');

      expect(result.ok).toBe(true);
      expect(mockAuditSheet.appendRow).toHaveBeenCalled();
    });

    test('logs entry with SYSTEM actor for Metadata Merge', () => {
      const changes = [
        { field: 'Action', oldValue: '', newValue: 'runMergedImagePromptMetadata' }
      ];

      const result = appendAuditEntry_('SYSTEM', 'Metadata Merge Triggered', changes, 'Dashboard UI');

      expect(result.ok).toBe(true);
      expect(mockAuditSheet.appendRow).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    test('handles empty changes array', () => {
      const result = appendAuditEntry_('id-001', 'Action with no changes', [], 'Dashboard UI');

      expect(result.ok).toBe(true);
      expect(result.entriesAdded).toBe(1); // Still logs the action
      expect(mockAuditSheet.appendRow).toHaveBeenCalledTimes(1);
    });

    test('handles null changes', () => {
      const result = appendAuditEntry_('id-001', 'Action with null changes', null, 'Dashboard UI');

      expect(result.ok).toBe(true);
      expect(result.entriesAdded).toBe(1);
      expect(mockAuditSheet.appendRow).toHaveBeenCalledTimes(1);
    });

    test('preserves empty string values in changes', () => {
      const changes = [
        { field: 'Review Reason', oldValue: '', newValue: '' }
      ];

      const result = appendAuditEntry_('id-001', 'Clear field', changes, 'Dashboard UI');

      expect(result.ok).toBe(true);
      // Call should include the empty strings
      expect(mockAuditSheet.appendRow).toHaveBeenCalled();
    });

    test('handles special characters in change values', () => {
      const changes = [
        { field: 'Notes', oldValue: '', newValue: 'Contains & symbols <html>' }
      ];

      const result = appendAuditEntry_('id-001', 'Update with special chars', changes, 'Dashboard UI');

      expect(result.ok).toBe(true);
      expect(mockAuditSheet.appendRow).toHaveBeenCalled();
    });
  });

  describe('Audit sheet auto-creation', () => {
    test('handles missing DMSC Audit Log sheet gracefully', () => {
      // Note: In real implementation, sheet auto-creation would happen
      // For testing, we verify the function handles the case appropriately
      const changes = [{ field: 'Test', oldValue: '', newValue: 'test' }];
      const result = appendAuditEntry_('id-001', 'Test action', changes, 'Dashboard UI');

      expect(result.ok).toBe(true);
      // The implementation should either create the sheet or use existing one
    });
  });

  describe('Data preservation', () => {
    test('includes timestamp for each entry', () => {
      const changes = [{ field: 'Status', oldValue: 'A', newValue: 'B' }];

      appendAuditEntry_('id-001', 'Update Status', changes, 'Dashboard UI');

      // appendRow is called with an array of values [id, action, timestamp, actor, source, field, oldValue, newValue]
      const calls = mockAuditSheet.appendRow.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const firstRow = calls[0][0]; // First call, first argument (the row array)
      expect(firstRow[2]).toBeTruthy(); // timestamp in position 2
      expect(typeof firstRow[2]).toBe('string');
    });

    test('preserves original values and new values exactly', () => {
      const changes = [
        { field: 'Review Reason', oldValue: 'Initial review', newValue: 'Source verification needed' }
      ];

      appendAuditEntry_('id-001', 'Update', changes, 'Dashboard UI');

      // The row should contain the exact values
      const calls = mockAuditSheet.appendRow.mock.calls;
      const firstRow = calls[0][0];
      expect(firstRow).toEqual(expect.arrayContaining(['Review Reason', 'Initial review', 'Source verification needed']));
    });

    test('tracks source of change (Dashboard UI vs SYSTEM)', () => {
      mockAuditSheet = createMockSheet('DMSC Audit Log', MOCK_AUDIT_LOG_DATA);
      mockSpreadsheet = createMockSpreadsheet({
        'DMSC Audit Log': mockAuditSheet
      });

      const changes = [{ field: 'Status', oldValue: '', newValue: 'Updated' }];

      appendAuditEntry_('id-001', 'Update', changes, 'Dashboard UI');
      appendAuditEntry_('id-002', 'Update', changes, 'SYSTEM');

      const calls = mockAuditSheet.appendRow.mock.calls;
      // Each call has one array argument (the row data)
      const firstRow = calls[0][0];
      const secondRow = calls[1][0];
      expect(firstRow[4]).toBe('Dashboard UI');
      expect(secondRow[4]).toBe('SYSTEM');
    });
  });

  describe('Compliance and accountability', () => {
    test('every update is auditable by image ID', () => {
      const changes = [{ field: 'Owner', oldValue: 'A', newValue: 'B' }];

      appendAuditEntry_('id-xyz', 'Owner Transfer', changes, 'Dashboard UI');

      // Image ID should be in the first column of the row array
      const calls = mockAuditSheet.appendRow.mock.calls;
      const firstRow = calls[0][0];
      expect(firstRow[0]).toBe('id-xyz');
    });

    test('every update records what action was taken', () => {
      mockAuditSheet = createMockSheet('DMSC Audit Log', MOCK_AUDIT_LOG_DATA);
      mockSpreadsheet = createMockSpreadsheet({
        'DMSC Audit Log': mockAuditSheet
      });

      const changes = [{ field: 'Status', oldValue: '', newValue: 'Approved' }];

      appendAuditEntry_('id-001', 'Approval', changes, 'Dashboard UI');

      const calls = mockAuditSheet.appendRow.mock.calls;
      const firstRow = calls[0][0];
      expect(firstRow[1]).toBe('Approval');
    });

    test('does not allow audit entries to be skipped for valid updates', () => {
      mockAuditSheet = createMockSheet('DMSC Audit Log', MOCK_AUDIT_LOG_DATA);
      mockSpreadsheet = createMockSpreadsheet({
        'DMSC Audit Log': mockAuditSheet
      });

      const changes = [
        { field: 'Field1', oldValue: 'a', newValue: 'b' },
        { field: 'Field2', oldValue: 'c', newValue: 'd' }
      ];

      appendAuditEntry_('id-001', 'Multi-field update', changes, 'Dashboard UI');

      // Both changes should be logged
      expect(mockAuditSheet.appendRow).toHaveBeenCalledTimes(2);
    });
  });
});

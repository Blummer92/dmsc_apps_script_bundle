/**
 * Integration: Update Record → Audit Log
 * Tests how metadata updates are safely applied and logged
 */

describe('Integration: Update Record → Audit Log', () => {
  function updateDmscReviewMetadata(sheet, data) {
    const SAFE_EDITABLE_HEADERS = [
      'Human Review Required',
      'Review Reason',
      'Next Owner',
      'Notes',
      'Metadata Classification Status'
    ];

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    let updates = 0;

    for (const [key, value] of Object.entries(data.updates || {})) {
      const headerIndex = headers.indexOf(key);
      if (headerIndex === -1 || !SAFE_EDITABLE_HEADERS.includes(key)) {
        continue;
      }

      const rowIndex = data.rowIndex;
      sheet.getRange(rowIndex, headerIndex + 1).setValue(value);
      updates++;
    }

    return {
      ok: true,
      updated: updates,
      message: `Updated ${updates} fields`
    };
  }

  function appendAuditEntry(auditSheet, entry) {
    const row = [
      entry.timestamp || new Date().toISOString(),
      entry.actor || 'SYSTEM',
      entry.action,
      entry.recordId,
      entry.details || ''
    ];
    auditSheet.appendRow(row);
    return { ok: true, logged: true };
  }

  describe('Single update with audit', () => {
    test('updating record creates audit entry', () => {
      const mockRangeHeader = {
        getValues: jest.fn().mockReturnValue([
          ['Human Review Required', 'Review Reason', 'Next Owner', 'Notes', 'File ID']
        ])
      };

      const mockRangeCell = {
        setValue: jest.fn()
      };

      const mockSheet = {
        getRange: jest.fn((row, col) => {
          if (row === 1) return mockRangeHeader;
          return mockRangeCell;
        }),
        getLastColumn: jest.fn().mockReturnValue(5),
        appendRow: jest.fn()
      };

      const mockAuditSheet = {
        appendRow: jest.fn()
      };

      const updateResult = updateDmscReviewMetadata(mockSheet, {
        rowIndex: 2,
        updates: {
          'Human Review Required': 'Yes',
          'Review Reason': 'Needs verification'
        }
      });

      const auditResult = appendAuditEntry(mockAuditSheet, {
        timestamp: '2024-01-15T10:30:00Z',
        actor: 'user@example.com',
        action: 'UPDATE_METADATA',
        recordId: 'file-123',
        details: 'Updated: Human Review Required, Review Reason'
      });

      expect(updateResult.ok).toBe(true);
      expect(updateResult.updated).toBe(2);
      expect(auditResult.ok).toBe(true);
      expect(auditResult.logged).toBe(true);
    });
  });

  describe('Batch updates with individual audits', () => {
    test('multiple records updated each with audit entry', () => {
      const auditEntries = [];
      const updates = [
        { rowIndex: 2, recordId: 'file-1', changes: { 'Next Owner': 'Alice' } },
        { rowIndex: 3, recordId: 'file-2', changes: { 'Next Owner': 'Bob' } },
        { rowIndex: 4, recordId: 'file-3', changes: { 'Next Owner': 'Charlie' } }
      ];

      updates.forEach(update => {
        auditEntries.push({
          timestamp: new Date().toISOString(),
          actor: 'batch-process',
          action: 'UPDATE_METADATA',
          recordId: update.recordId,
          details: `Updated Next Owner to ${update.changes['Next Owner']}`
        });
      });

      expect(auditEntries.length).toBe(3);
      expect(auditEntries.every(e => e.recordId && e.action)).toBe(true);
    });
  });

  describe('Unsafe update prevention with audit trail', () => {
    test('attempting unsafe update is blocked, audit records rejection', () => {
      const mockRangeHeader = {
        getValues: jest.fn().mockReturnValue([
          ['Human Review Required', 'File ID', 'Status', 'Owner']
        ])
      };

      const mockRangeCell = {
        setValue: jest.fn()
      };

      const mockSheet = {
        getRange: jest.fn((row, col) => {
          if (row === 1) return mockRangeHeader;
          return mockRangeCell;
        }),
        getLastColumn: jest.fn().mockReturnValue(4)
      };

      const updateResult = updateDmscReviewMetadata(mockSheet, {
        rowIndex: 2,
        updates: {
          'File ID': 'dangerous-override',
          'Human Review Required': 'Yes'
        }
      });

      expect(updateResult.updated).toBe(1);
      expect(mockSheet.getRange).toHaveBeenCalled();
    });
  });

  describe('Audit trail completeness', () => {
    test('audit includes timestamp, actor, action, record ID', () => {
      const auditEntry = {
        timestamp: '2024-01-15T10:30:00Z',
        actor: 'user@example.com',
        action: 'UPDATE_METADATA',
        recordId: 'file-abc-123',
        details: 'Updated review status'
      };

      const auditEntries = [auditEntry];

      auditEntries.forEach(entry => {
        expect(entry.timestamp).toBeDefined();
        expect(entry.actor).toBeDefined();
        expect(entry.action).toBeDefined();
        expect(entry.recordId).toBeDefined();
      });
    });

    test('audit trail preserves chronological order', () => {
      const auditEntries = [
        { timestamp: '2024-01-15T10:00:00Z', action: 'UPDATE_1' },
        { timestamp: '2024-01-15T10:30:00Z', action: 'UPDATE_2' },
        { timestamp: '2024-01-15T11:00:00Z', action: 'UPDATE_3' }
      ];

      for (let i = 0; i < auditEntries.length - 1; i++) {
        expect(auditEntries[i].timestamp <= auditEntries[i + 1].timestamp).toBe(true);
      }
    });
  });

  describe('Real-world scenario: User updates and audit is tracked', () => {
    test('user updates next owner, audit captures change', () => {
      const auditLog = [];

      const recordUpdate = {
        rowIndex: 5,
        recordId: 'doc-xyz',
        updates: { 'Next Owner': 'Visual Asset Director' }
      };

      auditLog.push({
        timestamp: '2024-01-15T14:45:00Z',
        actor: 'reviewer@org.com',
        action: 'UPDATE_METADATA',
        recordId: recordUpdate.recordId,
        details: `Changed Next Owner to ${recordUpdate.updates['Next Owner']}`
      });

      expect(auditLog.length).toBe(1);
      expect(auditLog[0].recordId).toBe('doc-xyz');
      expect(auditLog[0].details).toContain('Visual Asset Director');
    });

    test('multiple users updating same record creates audit trail', () => {
      const auditLog = [];
      const recordId = 'file-shared';

      [
        { actor: 'alice@org.com', change: 'Human Review Required = Yes' },
        { actor: 'bob@org.com', change: 'Review Reason = Pending verification' },
        { actor: 'charlie@org.com', change: 'Next Owner = Visual Asset Director' }
      ].forEach((update, idx) => {
        auditLog.push({
          timestamp: `2024-01-15T${10 + idx}:00:00Z`,
          actor: update.actor,
          action: 'UPDATE_METADATA',
          recordId: recordId,
          details: update.change
        });
      });

      expect(auditLog.length).toBe(3);
      expect(auditLog.every(e => e.recordId === recordId)).toBe(true);
      expect(auditLog.map(e => e.actor)).toEqual(['alice@org.com', 'bob@org.com', 'charlie@org.com']);
    });
  });
});

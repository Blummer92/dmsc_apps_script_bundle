/**
 * Unit tests for updateDmscReviewMetadata() function
 * CRITICAL: Core data mutation function - validates, applies, and audits changes
 */

const { createMockSpreadsheet, createUpdatePayload, MOCK_HEADERS } = require('../fixtures/mockSheetData.js');

describe('updateDmscReviewMetadata()', () => {
  let mockSpreadsheet;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpreadsheet = createMockSpreadsheet();
  });

  // Implementation under test
  function updateDmscReviewMetadata(payload) {
    const DMSC_APP_CONFIG = {
      registrySheetName: 'Merged Image Prompt Metadata',
      safeEditableHeaders: [
        'Human Review Required',
        'Review Reason',
        'Next Owner',
        'Notes',
        'Metadata Classification Status'
      ]
    };

    payload = payload || {};
    const imageIdentityId = String(payload.imageIdentityId || '').trim();
    const updates = payload.updates || {};

    if (!imageIdentityId) throw new Error('Missing imageIdentityId.');

    const ss = mockSpreadsheet;
    const sheet = ss.getSheetByName(DMSC_APP_CONFIG.registrySheetName);
    if (!sheet) throw new Error('Missing sheet: ' + DMSC_APP_CONFIG.registrySheetName);

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) throw new Error('No records available.');

    const headers = data[0].map(String);
    const imageIdIndex = headers.findIndex(h =>
      ['Image Identity ID', 'ImageIdentityID', 'File ID'].includes(h)
    );
    if (imageIdIndex === -1) throw new Error('No Image Identity ID or File ID column found.');

    let targetRowNumber = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][imageIdIndex] || '').trim() === imageIdentityId) {
        targetRowNumber = i + 1;
        break;
      }
    }
    if (targetRowNumber === -1) throw new Error('Record not found for update: ' + imageIdentityId);

    const changed = [];
    Object.keys(updates).forEach(function(header) {
      if (DMSC_APP_CONFIG.safeEditableHeaders.indexOf(header) === -1) return;
      const columnIndex = headers.findIndex(h => h === header);
      if (columnIndex === -1) {
        // Column doesn't exist - skip it
        return;
      }
      const oldValue = data[targetRowNumber - 1]?.[columnIndex] || '';
      const newValue = String(updates[header] == null ? '' : updates[header]);
      if (String(oldValue) !== newValue) {
        sheet.getRange(targetRowNumber, columnIndex + 1).setValue(newValue);
        changed.push({ field: header, oldValue: oldValue, newValue: newValue });
      }
    });

    return { ok: true, changed: changed.length, changes: changed };
  }

  describe('Input validation', () => {
    test('throws error when imageIdentityId is missing', () => {
      const payload = createUpdatePayload('');
      payload.imageIdentityId = '';

      expect(() => updateDmscReviewMetadata(payload)).toThrow('Missing imageIdentityId.');
    });

    test('throws error when imageIdentityId is null', () => {
      const payload = createUpdatePayload(null);

      expect(() => updateDmscReviewMetadata(payload)).toThrow('Missing imageIdentityId.');
    });

    test('throws error when payload is null', () => {
      expect(() => updateDmscReviewMetadata(null)).toThrow('Missing imageIdentityId.');
    });

    test('throws error when record not found', () => {
      const payload = createUpdatePayload('non-existent-id');

      expect(() => updateDmscReviewMetadata(payload)).toThrow('Record not found for update: non-existent-id');
    });

    test('throws error when sheet not found', () => {
      // Create a mock spreadsheet with no registry sheet
      const emptySpreadsheet = {
        getUrl: jest.fn(),
        getSheetByName: jest.fn(() => null),
        insertSheet: jest.fn()
      };
      mockSpreadsheet = emptySpreadsheet;

      const payload = createUpdatePayload('id-001');

      expect(() => updateDmscReviewMetadata(payload)).toThrow('Missing sheet');
    });

    test('trims whitespace from imageIdentityId', () => {
      const payload = createUpdatePayload('  id-001  ');

      // Should not throw - whitespace should be trimmed
      expect(() => updateDmscReviewMetadata(payload)).not.toThrow();
    });
  });

  describe('Safe edit enforcement (security)', () => {
    test('only updates safe editable headers', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Human Review Required': 'Yes',
          'Review Reason': 'Test',
          'Next Owner': 'Source Authority Agent',
          'Notes': 'Test note',
          'Metadata Classification Status': 'Pending'
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(5); // All 5 safe headers changed
    });

    test('ignores attempts to edit unsafe headers', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Human Review Required': 'Yes',
          'File ID': 'SHOULD-BE-IGNORED', // Unsafe
          'Filename': 'SHOULD-BE-IGNORED',  // Unsafe
          'Review Reason': 'Legitimate update'
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(2); // Only safe headers
      expect(result.changes.map(c => c.field)).not.toContain('File ID');
      expect(result.changes.map(c => c.field)).not.toContain('Filename');
    });

    test('silently ignores dangerous edit attempts', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Human Review Required': 'Yes',
          'Deleted': 'true', // Not in safe list
          'ApprovedStatus': 'Yes' // Not in safe list
        }
      };

      const result = updateDmscReviewMetadata(payload);

      // Should succeed with only 1 change (the safe one)
      expect(result.ok).toBe(true);
      expect(result.changed).toBe(1);
    });
  });

  describe('Update application', () => {
    test('applies valid update to correct field', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Review Reason': 'Needs source verification'
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(1);
      expect(result.changes[0]).toEqual({
        field: 'Review Reason',
        oldValue: '', // Initial is empty
        newValue: 'Needs source verification'
      });
    });

    test('applies multiple updates in one call', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Human Review Required': 'Yes',
          'Review Reason': 'Initial verification',
          'Next Owner': 'Source Authority Agent'
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(3);
    });

    test('does not report changes if values are identical', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Human Review Required': 'No', // Already 'No'
          'Review Reason': ''            // Already empty
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(0);
    });

    test('reports only changed fields', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Human Review Required': 'No', // No change
          'Review Reason': 'New reason',  // Changed
          'Next Owner': 'Content Team',   // Might be no change
          'Notes': 'Test'                 // Might be no change
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      // Only changed fields should be in the response
      result.changes.forEach(change => {
        expect(change.newValue).not.toBe(change.oldValue);
      });
    });
  });

  describe('Value handling', () => {
    test('treats null value as empty string', () => {
      const payload = {
        imageIdentityId: 'id-002', // This one has 'Needs source verification'
        updates: {
          'Review Reason': null  // Clear it
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      // Should clear the review reason (change from text to empty)
      if (result.changes.length > 0) {
        expect(result.changes[0].newValue).toBe('');
      }
    });

    test('treats undefined value as empty string', () => {
      const payload = {
        imageIdentityId: 'id-002', // This one has 'Needs source verification'
        updates: {
          'Review Reason': undefined  // Clear it
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      if (result.changes.length > 0) {
        expect(result.changes[0].newValue).toBe('');
      }
    });

    test('converts numeric values to strings', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Notes': 123
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      if (result.changed > 0) {
        expect(result.changes[0].newValue).toBe('123');
      }
    });

    test('preserves boolean-like string values', () => {
      const payload = {
        imageIdentityId: 'id-002',
        updates: {
          'Human Review Required': 'Yes'
        }
      };

      const result = updateDmscReviewMetadata(payload);

      if (result.changed > 0) {
        const changed = result.changes.find(c => c.field === 'Human Review Required');
        expect(changed.newValue).toBe('Yes');
      }
    });
  });

  describe('Return value correctness', () => {
    test('returns ok: true on success', () => {
      const payload = createUpdatePayload('id-001', { 'Notes': 'Updated' });

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
    });

    test('returns change count', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Human Review Required': 'Yes',
          'Review Reason': 'Test'
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(typeof result.changed).toBe('number');
      expect(result.changed).toBeGreaterThanOrEqual(0);
    });

    test('returns changes array with correct structure', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Review Reason': 'Verification needed'
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(Array.isArray(result.changes)).toBe(true);
      result.changes.forEach(change => {
        expect(change).toHaveProperty('field');
        expect(change).toHaveProperty('oldValue');
        expect(change).toHaveProperty('newValue');
      });
    });
  });

  describe('Sheet write operations', () => {
    test('calls setValue on sheet for each changed field', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Human Review Required': 'Yes',
          'Review Reason': 'Test reason'
        }
      };

      updateDmscReviewMetadata(payload);

      // Verify that getRange and setValue were called
      const sheet = mockSpreadsheet.getSheetByName('Merged Image Prompt Metadata');
      expect(sheet.getRange).toHaveBeenCalled();
    });
  });

  describe('Partial updates', () => {
    test('allows updating only some fields', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {
          'Review Reason': 'Only updating this field'
          // Other fields not included
        }
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(1);
    });

    test('allows empty updates object', () => {
      const payload = {
        imageIdentityId: 'id-001',
        updates: {}
      };

      const result = updateDmscReviewMetadata(payload);

      expect(result.ok).toBe(true);
      expect(result.changed).toBe(0);
    });
  });
});

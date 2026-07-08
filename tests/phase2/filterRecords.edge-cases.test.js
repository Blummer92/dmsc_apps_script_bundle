/**
 * Filter Records: Edge Cases tests
 * Tests no filters, null/missing fields, empty inputs
 */

describe('filterRecords_() - Edge Cases', () => {
  function filterRecords_(records, request) {
    request = request || {};
    let filtered = records;

    if (request.search) {
      const searchLower = String(request.search).toLowerCase();
      filtered = filtered.filter(record => {
        const fileName = String(record.fileName || '').toLowerCase();
        const fullPath = String(record.fullPath || '').toLowerCase();
        const status = String(record.status || '').toLowerCase();
        const owner = String(record.owner || '').toLowerCase();
        return fileName.includes(searchLower) || fullPath.includes(searchLower) ||
               status.includes(searchLower) || owner.includes(searchLower);
      });
    }

    if (request.nextOwner) {
      filtered = filtered.filter(r => String(r.owner || '') === request.nextOwner);
    }

    return filtered;
  }

  describe('No Filters Applied', () => {
    test('returns all records when no filters specified', () => {
      const records = [
        { id: '1', fileName: 'a.jpg', owner: 'Alice' },
        { id: '2', fileName: 'b.jpg', owner: 'Bob' }
      ];

      const result = filterRecords_(records, {});

      expect(result.length).toBe(2);
    });

    test('returns all records with null request', () => {
      const records = [
        { id: '1', fileName: 'a.jpg' },
        { id: '2', fileName: 'b.jpg' }
      ];

      const result = filterRecords_(records, null);

      expect(result.length).toBe(2);
    });

    test('returns all records with undefined request', () => {
      const records = [
        { id: '1', fileName: 'a.jpg' },
        { id: '2', fileName: 'b.jpg' }
      ];

      const result = filterRecords_(records);

      expect(result.length).toBe(2);
    });
  });

  describe('Null and Missing Fields', () => {
    test('handles records with null field values', () => {
      const records = [
        { id: '1', fileName: null, owner: null, status: null, fullPath: null },
        { id: '2', fileName: 'test.jpg', owner: 'Alice', status: 'Approved', fullPath: 'Drive/' }
      ];

      const result = filterRecords_(records, { search: 'test' });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });

    test('handles records with missing fields', () => {
      const records = [
        { id: '1' },
        { id: '2', fileName: 'test.jpg' }
      ];

      const result = filterRecords_(records, { search: 'test' });

      expect(result.length).toBe(1);
    });

    test('handles records with undefined fields', () => {
      const records = [
        { id: '1', fileName: undefined, owner: undefined },
        { id: '2', fileName: 'search.jpg', owner: 'Alice' }
      ];

      const result = filterRecords_(records, { search: 'search' });

      expect(result.length).toBe(1);
    });
  });

  describe('Empty Inputs', () => {
    test('handles empty records array', () => {
      const result = filterRecords_([], { search: 'anything' });

      expect(result.length).toBe(0);
    });

    test('handles empty search string', () => {
      const records = [
        { id: '1', fileName: 'a.jpg', owner: 'Alice' },
        { id: '2', fileName: 'b.jpg', owner: 'Bob' }
      ];

      const result = filterRecords_(records, { search: '' });

      expect(result.length).toBe(2);
    });

    test('search with whitespace-only string', () => {
      const records = [
        { id: '1', fileName: 'a.jpg', owner: 'Alice' }
      ];

      const result = filterRecords_(records, { search: '   ' });

      expect(result.length).toBe(0);
    });

    test('handles record with all empty string fields', () => {
      const records = [
        { id: '1', fileName: '', owner: '', status: '', fullPath: '' },
        { id: '2', fileName: 'a.jpg', owner: 'Alice' }
      ];

      const result = filterRecords_(records, { search: 'a' });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });
  });
});

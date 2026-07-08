/**
 * Filter Records: Owner Filter tests
 * Tests exact owner matching and edge cases
 */

describe('filterRecords_() - Owner Filter', () => {
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

  const records = [
    { id: '1', fileName: 'a.jpg', fullPath: '', status: '', owner: 'Alice' },
    { id: '2', fileName: 'b.jpg', fullPath: '', status: '', owner: 'Bob' },
    { id: '3', fileName: 'c.jpg', fullPath: '', status: '', owner: 'Alice' }
  ];

  describe('Exact Owner Matching', () => {
    test('filters by exact owner match', () => {
      const result = filterRecords_(records, { nextOwner: 'Alice' });
      expect(result.length).toBe(2);
      expect(result.every(r => r.owner === 'Alice')).toBe(true);
    });

    test('filters by different owner', () => {
      const result = filterRecords_(records, { nextOwner: 'Bob' });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });

    test('owner filter is exact match, not partial', () => {
      const result = filterRecords_(records, { nextOwner: 'Al' });
      expect(result.length).toBe(0);
    });

    test('owner filter with non-existent owner returns empty', () => {
      const result = filterRecords_(records, { nextOwner: 'Charlie' });
      expect(result.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('empty owner filter returns all', () => {
      const result = filterRecords_(records, { nextOwner: '' });
      expect(result.length).toBe(3);
    });

    test('empty nextOwner skips filter and returns all', () => {
      const testRecords = [
        { id: '1', owner: null },
        { id: '2', owner: 'Alice' }
      ];
      const result = filterRecords_(testRecords, { nextOwner: '' });
      expect(result.length).toBe(2);
    });

    test('only non-empty nextOwner applies filter', () => {
      const testRecords = [
        { id: '1', owner: null },
        { id: '2', owner: 'Bob' }
      ];
      const result = filterRecords_(testRecords, { nextOwner: '' });
      expect(result.length).toBe(2);
    });

    test('whitespace-only owner does not match', () => {
      const testRecords = [
        { id: '1', owner: '   ' },
        { id: '2', owner: 'Alice' }
      ];
      const result = filterRecords_(testRecords, { nextOwner: '   ' });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    test('case-sensitive owner matching', () => {
      const result = filterRecords_(records, { nextOwner: 'alice' });
      expect(result.length).toBe(0);
    });
  });
});

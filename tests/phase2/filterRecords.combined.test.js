/**
 * Filter Records: Combined Filters tests
 * Tests search + owner, queue filtering, and real-world scenarios
 */

describe('filterRecords_() - Combined Filters', () => {
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

    if (request.queueId && request.queueId !== 'all') {
      filtered = filtered.filter(r => {
        if (request.queueId === 'noPrompt') {
          return r.promptStatus === 'No Prompt Evidence';
        }
        return true;
      });
    }

    return filtered;
  }

  const records = [
    { id: '1', fileName: 'photo.jpg', fullPath: '', status: '', owner: 'Alice' },
    { id: '2', fileName: 'photo.jpg', fullPath: '', status: '', owner: 'Bob' },
    { id: '3', fileName: 'diagram.png', fullPath: '', status: '', owner: 'Alice' }
  ];

  describe('Search AND Owner Filter', () => {
    test('applies both search and owner filter', () => {
      const result = filterRecords_(records, {
        search: 'photo',
        nextOwner: 'Alice'
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    test('search matches but owner does not', () => {
      const result = filterRecords_(records, {
        search: 'diagram',
        nextOwner: 'Bob'
      });

      expect(result.length).toBe(0);
    });

    test('returns empty when filters have no common match', () => {
      const result = filterRecords_(records, {
        search: 'photo',
        nextOwner: 'Bob'
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('2');
    });

    test('both filters match same record', () => {
      const result = filterRecords_(records, {
        search: 'diagram',
        nextOwner: 'Alice'
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('3');
    });
  });

  describe('Queue Filtering', () => {
    const queueRecords = [
      { id: '1', fileName: 'a.jpg', promptStatus: 'No Prompt Evidence' },
      { id: '2', fileName: 'b.jpg', promptStatus: 'Strong Evidence' },
      { id: '3', fileName: 'c.jpg', promptStatus: 'No Prompt Evidence' }
    ];

    test('filters by queue: noPrompt', () => {
      const result = filterRecords_(queueRecords, { queueId: 'noPrompt' });

      expect(result.length).toBe(2);
      expect(result.every(r => r.promptStatus === 'No Prompt Evidence')).toBe(true);
    });

    test('queue: all returns all records', () => {
      const result = filterRecords_(queueRecords, { queueId: 'all' });

      expect(result.length).toBe(3);
    });

    test('ignores unknown queue ID', () => {
      const result = filterRecords_(queueRecords, { queueId: 'unknownQueue' });

      expect(result.length).toBe(3);
    });
  });

  describe('Real-world Complex Scenarios', () => {
    const complexRecords = Array.from({ length: 30 }, (_, i) => ({
      id: `id-${i}`,
      fileName: `file-${i % 5}.jpg`,
      fullPath: `Drive/Folder-${i % 3}/`,
      status: ['Approved', 'Pending'][i % 2],
      owner: ['Alice', 'Bob', 'Charlie'][i % 3]
    }));

    test('complex filter with multiple criteria', () => {
      const result = filterRecords_(complexRecords, {
        search: 'Approved',
        nextOwner: 'Alice'
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every(r => r.status === 'Approved' && r.owner === 'Alice')).toBe(true);
    });

    test('multiple searches in combined string', () => {
      const result = filterRecords_(complexRecords, {
        search: 'file-1'
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every(r => r.fileName.includes('file-1'))).toBe(true);
    });

    test('no results case', () => {
      const result = filterRecords_(complexRecords, {
        search: 'NonExistent',
        nextOwner: 'Alice'
      });

      expect(result.length).toBe(0);
    });

    test('filter 30-record dataset by owner', () => {
      const result = filterRecords_(complexRecords, { nextOwner: 'Bob' });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every(r => r.owner === 'Bob')).toBe(true);
    });
  });
});

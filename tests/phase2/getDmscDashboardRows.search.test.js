/**
 * Dashboard Rows: Search & filtering tests
 * Tests: Search across fields, owner filter, combined filters
 */

describe('getDmscDashboardRows() - Search & Filtering', () => {
  function getDmscDashboardRows(records, request) {
    request = request || {};
    let filtered = records;

    if (request.search) {
      const searchLower = String(request.search).toLowerCase();
      filtered = filtered.filter(r => {
        const fileName = String(r.fileName || '').toLowerCase();
        const fullPath = String(r.fullPath || '').toLowerCase();
        const status = String(r.status || '').toLowerCase();
        const owner = String(r.owner || '').toLowerCase();
        return fileName.includes(searchLower) || fullPath.includes(searchLower) ||
               status.includes(searchLower) || owner.includes(searchLower);
      });
    }

    if (request.nextOwner) {
      filtered = filtered.filter(r => String(r.owner || '') === request.nextOwner);
    }

    return {
      ok: true,
      total: filtered.length,
      records: filtered
    };
  }

  const records = [
    { id: '1', fileName: 'photo-spring.jpg', fullPath: 'Drive/Images/', status: 'Approved', owner: 'Alice' },
    { id: '2', fileName: 'photo-summer.jpg', fullPath: 'Drive/Images/', status: 'Pending', owner: 'Bob' },
    { id: '3', fileName: 'diagram.png', fullPath: 'Drive/Diagrams/', status: 'Approved', owner: 'Alice' }
  ];

  describe('Search - Filename', () => {
    test('finds by exact filename', () => {
      const result = getDmscDashboardRows(records, { search: 'photo-spring' });
      expect(result.total).toBe(1);
    });

    test('finds by partial filename', () => {
      const result = getDmscDashboardRows(records, { search: 'photo' });
      expect(result.total).toBe(2);
    });

    test('is case-insensitive', () => {
      const result = getDmscDashboardRows(records, { search: 'PHOTO' });
      expect(result.total).toBe(2);
    });

    test('returns empty for no match', () => {
      const result = getDmscDashboardRows(records, { search: 'video' });
      expect(result.total).toBe(0);
    });
  });

  describe('Search - Path', () => {
    test('finds by path component', () => {
      const result = getDmscDashboardRows(records, { search: 'Images' });
      expect(result.total).toBe(2);
    });

    test('finds by folder name', () => {
      const result = getDmscDashboardRows(records, { search: 'Diagrams' });
      expect(result.total).toBe(1);
    });

    test('is case-insensitive', () => {
      const result = getDmscDashboardRows(records, { search: 'drive' });
      expect(result.total).toBe(3);
    });
  });

  describe('Search - Status', () => {
    test('finds by status', () => {
      const result = getDmscDashboardRows(records, { search: 'Approved' });
      expect(result.total).toBe(2);
    });

    test('finds different status', () => {
      const result = getDmscDashboardRows(records, { search: 'Pending' });
      expect(result.total).toBe(1);
    });
  });

  describe('Search - Owner', () => {
    test('finds by owner name', () => {
      const result = getDmscDashboardRows(records, { search: 'Alice' });
      expect(result.total).toBe(2);
    });

    test('is case-insensitive', () => {
      const result = getDmscDashboardRows(records, { search: 'bob' });
      expect(result.total).toBe(1);
    });
  });

  describe('Owner Filter', () => {
    test('filters by exact owner', () => {
      const result = getDmscDashboardRows(records, { nextOwner: 'Alice' });
      expect(result.total).toBe(2);
    });

    test('filters by different owner', () => {
      const result = getDmscDashboardRows(records, { nextOwner: 'Bob' });
      expect(result.total).toBe(1);
    });

    test('empty owner filter returns all', () => {
      const result = getDmscDashboardRows(records, { nextOwner: '' });
      expect(result.total).toBe(3);
    });

    test('non-existent owner returns empty', () => {
      const result = getDmscDashboardRows(records, { nextOwner: 'Charlie' });
      expect(result.total).toBe(0);
    });
  });

  describe('Combined Filters', () => {
    test('applies search AND owner', () => {
      const result = getDmscDashboardRows(records, {
        search: 'photo',
        nextOwner: 'Alice'
      });
      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('1');
    });

    test('search matches but owner doesnt', () => {
      const result = getDmscDashboardRows(records, {
        search: 'photo',
        nextOwner: 'Bob'
      });
      expect(result.total).toBe(1);
    });

    test('both filters have no common match', () => {
      const result = getDmscDashboardRows(records, {
        search: 'diagram',
        nextOwner: 'Bob'
      });
      expect(result.total).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('handles null fields', () => {
      const testRecords = [
        { id: '1', fileName: null, owner: null },
        { id: '2', fileName: 'test.jpg', owner: 'Alice' }
      ];
      const result = getDmscDashboardRows(testRecords, { search: 'test' });
      expect(result.total).toBe(1);
    });

    test('handles missing fields', () => {
      const testRecords = [{ id: '1' }, { id: '2', fileName: 'test.jpg' }];
      const result = getDmscDashboardRows(testRecords, { search: 'test' });
      expect(result.total).toBe(1);
    });

    test('empty search returns all', () => {
      const result = getDmscDashboardRows(records, { search: '' });
      expect(result.total).toBe(3);
    });
  });
});

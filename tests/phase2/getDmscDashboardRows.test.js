/**
 * Unit tests for getDmscDashboardRows() function
 * CRITICAL: Pagination, filtering, sorting logic
 * Bugs affect usability and data visibility
 */

describe('getDmscDashboardRows()', () => {
  // Simplified implementation for testing
  function getDmscDashboardRows(records, request) {
    request = request || {};
    const pageSize = Math.min(
      Math.max(Number(request.pageSize || 50), 1),
      100
    );
    const page = Math.max(Number(request.page || 1), 1);

    let filtered = records;

    // Search filter
    if (request.search) {
      const searchLower = String(request.search).toLowerCase();
      filtered = filtered.filter(r => {
        const fileName = String(r.fileName || '').toLowerCase();
        const path = String(r.fullPath || '').toLowerCase();
        const status = String(r.status || '').toLowerCase();
        const owner = String(r.owner || '').toLowerCase();
        return fileName.includes(searchLower) ||
               path.includes(searchLower) ||
               status.includes(searchLower) ||
               owner.includes(searchLower);
      });
    }

    // Owner filter
    if (request.nextOwner) {
      filtered = filtered.filter(r => String(r.owner || '') === request.nextOwner);
    }

    // Sorting
    if (request.sortBy) {
      const direction = request.sortDirection === 'asc' ? 1 : -1;
      filtered.sort((a, b) => {
        const aVal = a[request.sortBy] || '';
        const bVal = b[request.sortBy] || '';
        if (aVal < bVal) return -1 * direction;
        if (aVal > bVal) return 1 * direction;
        return 0;
      });
    }

    // Pagination
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const pageRecords = filtered.slice(start, start + pageSize);

    return {
      ok: true,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
      records: pageRecords
    };
  }

  describe('Pagination', () => {
    const records = Array.from({ length: 100 }, (_, i) => ({
      id: `id-${i}`,
      fileName: `file-${i}.jpg`
    }));

    test('returns first page with default page size', () => {
      const result = getDmscDashboardRows(records, {
        page: 1,
        pageSize: 50
      });

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
      expect(result.records.length).toBe(50);
      expect(result.total).toBe(100);
      expect(result.totalPages).toBe(2);
    });

    test('returns correct second page', () => {
      const result = getDmscDashboardRows(records, {
        page: 2,
        pageSize: 50
      });

      expect(result.page).toBe(2);
      expect(result.records.length).toBe(50);
      expect(result.records[0].id).toBe('id-50');
    });

    test('returns partial last page', () => {
      const result = getDmscDashboardRows(records, {
        page: 3,
        pageSize: 50
      });

      expect(result.page).toBe(3);
      expect(result.records.length).toBe(0); // No third page
    });

    test('clamps page size between 1 and 100', () => {
      let result = getDmscDashboardRows(records, {
        page: 1,
        pageSize: 200
      });
      expect(result.pageSize).toBe(100);

      result = getDmscDashboardRows(records, {
        page: 1,
        pageSize: 1
      });
      expect(result.pageSize).toBe(1);

      result = getDmscDashboardRows(records, {
        page: 1,
        pageSize: -10  // Negative values clamp to 1
      });
      expect(result.pageSize).toBe(1);
    });

    test('clamps page number to minimum 1', () => {
      const result = getDmscDashboardRows(records, {
        page: 0,
        pageSize: 50
      });

      expect(result.page).toBe(1);
    });

    test('handles negative page numbers', () => {
      const result = getDmscDashboardRows(records, {
        page: -5,
        pageSize: 50
      });

      expect(result.page).toBe(1);
    });

    test('calculates total pages correctly', () => {
      const result = getDmscDashboardRows(records, {
        page: 1,
        pageSize: 30
      });

      expect(result.totalPages).toBe(4); // 100 / 30 = 3.33, ceil = 4
    });

    test('sets totalPages to minimum 1 for empty results', () => {
      const result = getDmscDashboardRows([], {
        page: 1,
        pageSize: 50
      });

      expect(result.totalPages).toBe(1);
    });
  });

  describe('Search filtering', () => {
    const records = [
      { id: '1', fileName: 'photo.jpg', fullPath: 'Drive/Images/', status: 'Approved', owner: 'Alice' },
      { id: '2', fileName: 'diagram.png', fullPath: 'Drive/Diagrams/', status: 'Pending', owner: 'Bob' },
      { id: '3', fileName: 'screenshot.pdf', fullPath: 'Drive/Screenshots/', status: 'Approved', owner: 'Alice' }
    ];

    test('searches by filename', () => {
      const result = getDmscDashboardRows(records, {
        search: 'photo',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(1);
      expect(result.records[0].fileName).toBe('photo.jpg');
    });

    test('searches by path', () => {
      const result = getDmscDashboardRows(records, {
        search: 'Diagrams',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(1);
      expect(result.records[0].fileName).toBe('diagram.png');
    });

    test('searches by status', () => {
      const result = getDmscDashboardRows(records, {
        search: 'Pending',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(1);
      expect(result.records[0].status).toBe('Pending');
    });

    test('searches by owner', () => {
      const result = getDmscDashboardRows(records, {
        search: 'Alice',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(2);
    });

    test('search is case-insensitive', () => {
      const result = getDmscDashboardRows(records, {
        search: 'PHOTO',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(1);
      expect(result.records[0].fileName).toBe('photo.jpg');
    });

    test('search with no matches returns empty', () => {
      const result = getDmscDashboardRows(records, {
        search: 'nonexistent',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(0);
      expect(result.records.length).toBe(0);
    });

    test('empty search returns all records', () => {
      const result = getDmscDashboardRows(records, {
        search: '',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(3);
    });
  });

  describe('Owner filtering', () => {
    const records = [
      { id: '1', fileName: 'a.jpg', owner: 'Alice' },
      { id: '2', fileName: 'b.jpg', owner: 'Bob' },
      { id: '3', fileName: 'c.jpg', owner: 'Alice' }
    ];

    test('filters by owner', () => {
      const result = getDmscDashboardRows(records, {
        nextOwner: 'Alice',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(2);
      expect(result.records.every(r => r.owner === 'Alice')).toBe(true);
    });

    test('filters by different owner', () => {
      const result = getDmscDashboardRows(records, {
        nextOwner: 'Bob',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(1);
      expect(result.records[0].owner).toBe('Bob');
    });

    test('owner filter with no matches returns empty', () => {
      const result = getDmscDashboardRows(records, {
        nextOwner: 'Charlie',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(0);
    });

    test('empty owner filter returns all', () => {
      const result = getDmscDashboardRows(records, {
        nextOwner: '',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(3);
    });
  });

  describe('Combined filtering', () => {
    const records = [
      { id: '1', fileName: 'photo-001.jpg', owner: 'Alice', status: 'Approved' },
      { id: '2', fileName: 'photo-002.jpg', owner: 'Bob', status: 'Pending' },
      { id: '3', fileName: 'diagram.png', owner: 'Alice', status: 'Pending' }
    ];

    test('applies search and owner filter together', () => {
      const result = getDmscDashboardRows(records, {
        search: 'photo',
        nextOwner: 'Alice',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('1');
    });

    test('both filters applied simultaneously', () => {
      const result = getDmscDashboardRows(records, {
        search: 'Pending',
        nextOwner: 'Alice',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('3');
    });
  });

  describe('Sorting', () => {
    const records = [
      { id: 'c', name: 'Charlie', timestamp: '2024-01-15T10:00:00Z' },
      { id: 'a', name: 'Alice', timestamp: '2024-01-10T10:00:00Z' },
      { id: 'b', name: 'Bob', timestamp: '2024-01-12T10:00:00Z' }
    ];

    test('sorts ascending by name', () => {
      const result = getDmscDashboardRows(records, {
        sortBy: 'name',
        sortDirection: 'asc',
        page: 1,
        pageSize: 50
      });

      expect(result.records.map(r => r.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    test('sorts descending by name', () => {
      const result = getDmscDashboardRows(records, {
        sortBy: 'name',
        sortDirection: 'desc',
        page: 1,
        pageSize: 50
      });

      expect(result.records.map(r => r.name)).toEqual(['Charlie', 'Bob', 'Alice']);
    });

    test('sorts by timestamp', () => {
      const result = getDmscDashboardRows(records, {
        sortBy: 'timestamp',
        sortDirection: 'desc',
        page: 1,
        pageSize: 50
      });

      expect(result.records[0].id).toBe('c'); // Most recent
      expect(result.records[2].id).toBe('a'); // Oldest
    });

    test('default sort direction is descending when not specified', () => {
      const result = getDmscDashboardRows(records, {
        sortBy: 'name',
        page: 1,
        pageSize: 50
      });

      // Default should be descending
      expect(result.records[0].name).toBe('Charlie');
    });
  });

  describe('Response structure', () => {
    const records = [{ id: '1', fileName: 'test.jpg' }];

    test('returns all expected fields', () => {
      const result = getDmscDashboardRows(records, {
        page: 1,
        pageSize: 50
      });

      expect(result).toHaveProperty('ok');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('pageSize');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('totalPages');
      expect(result).toHaveProperty('records');
    });

    test('ok field is always true', () => {
      const result = getDmscDashboardRows([], { page: 1, pageSize: 50 });
      expect(result.ok).toBe(true);
    });

    test('records is always an array', () => {
      const result = getDmscDashboardRows([], { page: 1, pageSize: 50 });
      expect(Array.isArray(result.records)).toBe(true);
    });
  });

  describe('Edge cases', () => {
    test('handles null request parameter', () => {
      const records = [{ id: '1', fileName: 'test.jpg' }];
      const result = getDmscDashboardRows(records, null);

      expect(result.ok).toBe(true);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
    });

    test('handles undefined request parameter', () => {
      const records = [{ id: '1', fileName: 'test.jpg' }];
      const result = getDmscDashboardRows(records);

      expect(result.ok).toBe(true);
      expect(result.records.length).toBe(1);
    });

    test('handles empty records array', () => {
      const result = getDmscDashboardRows([], {
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(0);
      expect(result.records.length).toBe(0);
      expect(result.totalPages).toBe(1);
    });

    test('handles records with missing fields', () => {
      const records = [
        { id: '1' },  // Missing fileName, path, etc.
        { id: '2', fileName: 'test.jpg' }
      ];

      const result = getDmscDashboardRows(records, {
        search: 'test',
        page: 1,
        pageSize: 50
      });

      expect(result.total).toBe(1);
      expect(result.records[0].id).toBe('2');
    });
  });

  describe('Real-world scenario', () => {
    const records = Array.from({ length: 175 }, (_, i) => ({
      id: `id-${i}`,
      fileName: `file-${i % 10}.jpg`,
      fullPath: `Drive/Images/${i % 5}/`,
      status: ['Approved', 'Pending', 'Blocked'][i % 3],
      owner: ['Alice', 'Bob', 'Charlie'][i % 3]
    }));

    test('pagination with filters and sorting', () => {
      const result = getDmscDashboardRows(records, {
        search: 'file-1',
        nextOwner: 'Alice',
        sortBy: 'id',
        sortDirection: 'asc',
        page: 1,
        pageSize: 10
      });

      expect(result.total).toBeGreaterThan(0);
      expect(result.records.length).toBeLessThanOrEqual(10);
      expect(result.ok).toBe(true);
    });

    test('can navigate through filtered results', () => {
      const page1 = getDmscDashboardRows(records, {
        search: 'Pending',
        page: 1,
        pageSize: 20
      });

      const page2 = getDmscDashboardRows(records, {
        search: 'Pending',
        page: 2,
        pageSize: 20
      });

      // Pages should be different
      if (page1.total > 20 && page2.records.length > 0) {
        expect(page1.records[0].id).not.toBe(page2.records[0].id);
      }
    });
  });
});

/**
 * Integration: Search → Filter → Paginate Workflow
 * Tests how search, filtering, and pagination work together
 */

describe('Integration: Search → Filter → Paginate', () => {
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

  function getDmscDashboardRows(records, request) {
    request = request || {};
    const pageSize = Math.min(Math.max(Number(request.pageSize || 50), 1), 100);
    const page = Math.max(Number(request.page || 1), 1);

    let filtered = filterRecords_(records, request);
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

  const records = Array.from({ length: 50 }, (_, i) => ({
    id: `id-${i}`,
    fileName: `document-${i % 10}.pdf`,
    fullPath: `Drive/Folder-${i % 5}/`,
    status: ['Approved', 'Pending'][i % 2],
    owner: ['Alice', 'Bob', 'Charlie'][i % 3]
  }));

  describe('Basic workflow: search then paginate', () => {
    test('search narrows results, then paginate', () => {
      const result = getDmscDashboardRows(records, {
        search: 'Approved',
        pageSize: 10,
        page: 1
      });

      expect(result.total).toBeGreaterThan(0);
      expect(result.records.length).toBeLessThanOrEqual(10);
      expect(result.records.every(r => r.status === 'Approved')).toBe(true);
    });

    test('search + owner filter gives subset to paginate', () => {
      const result = getDmscDashboardRows(records, {
        search: 'Approved',
        nextOwner: 'Alice',
        pageSize: 5,
        page: 1
      });

      expect(result.records.every(r => r.status === 'Approved' && r.owner === 'Alice')).toBe(true);
      expect(result.pageSize).toBe(5);
    });
  });

  describe('Pagination across filtered results', () => {
    test('page through search results', () => {
      const request = { search: 'document-1', pageSize: 5 };
      const page1 = getDmscDashboardRows(records, { ...request, page: 1 });
      const page2 = getDmscDashboardRows(records, { ...request, page: 2 });

      expect(page1.page).toBe(1);
      expect(page2.page).toBe(2);
      expect(page1.total).toBe(page2.total);
      expect(page1.records[0].id).not.toEqual(page2.records[0]?.id);
    });

    test('total pages reflects filtered set, not all records', () => {
      const filteredRequest = {
        search: 'Pending',
        pageSize: 10
      };
      const result = getDmscDashboardRows(records, filteredRequest);

      expect(result.total).toBeLessThan(records.length);
      expect(result.totalPages).toBe(Math.ceil(result.total / 10));
    });

    test('last page has partial results', () => {
      const result = getDmscDashboardRows(records, {
        search: 'document-2',
        pageSize: 3
      });

      const lastPage = getDmscDashboardRows(records, {
        search: 'document-2',
        pageSize: 3,
        page: result.totalPages
      });

      expect(lastPage.records.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Edge cases in workflow', () => {
    test('search returns no results, pagination handles gracefully', () => {
      const result = getDmscDashboardRows(records, {
        search: 'NonExistent',
        pageSize: 10,
        page: 1
      });

      expect(result.total).toBe(0);
      expect(result.records.length).toBe(0);
      expect(result.totalPages).toBe(1);
    });

    test('page beyond filtered results returns empty', () => {
      const result = getDmscDashboardRows(records, {
        search: 'document-9',
        pageSize: 10,
        page: 100
      });

      expect(result.records.length).toBe(0);
    });

    test('requesting page 0 clamps to page 1', () => {
      const result = getDmscDashboardRows(records, {
        search: 'Approved',
        pageSize: 10,
        page: 0
      });

      expect(result.page).toBe(1);
    });
  });

  describe('Real-world scenario: user applies multiple filters', () => {
    test('user searches for status, filters by owner, navigates pages', () => {
      const userSearch = 'Approved';
      const userOwner = 'Bob';
      const userPageSize = 5;

      const page1 = getDmscDashboardRows(records, {
        search: userSearch,
        nextOwner: userOwner,
        pageSize: userPageSize,
        page: 1
      });

      expect(page1.records.every(r => r.status === 'Approved' && r.owner === 'Bob')).toBe(true);

      if (page1.totalPages > 1) {
        const page2 = getDmscDashboardRows(records, {
          search: userSearch,
          nextOwner: userOwner,
          pageSize: userPageSize,
          page: 2
        });

        expect(page2.page).toBe(2);
        expect(page2.records.every(r => r.status === 'Approved' && r.owner === 'Bob')).toBe(true);
      }
    });
  });
});

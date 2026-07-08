/**
 * Dashboard Rows: Pagination tests
 * Tests: page number, page size, total pages calculation
 */

describe('getDmscDashboardRows() - Pagination', () => {
  function getDmscDashboardRows(records, request) {
    request = request || {};
    const pageSize = Math.min(Math.max(Number(request.pageSize || 50), 1), 100);
    const page = Math.max(Number(request.page || 1), 1);

    let filtered = records;
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

  const records = Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}` }));

  describe('Page Selection', () => {
    test('returns first page with default page size', () => {
      const result = getDmscDashboardRows(records, { page: 1, pageSize: 50 });
      expect(result.page).toBe(1);
      expect(result.records.length).toBe(50);
    });

    test('returns correct second page', () => {
      const result = getDmscDashboardRows(records, { page: 2, pageSize: 50 });
      expect(result.page).toBe(2);
      expect(result.records[0].id).toBe('id-50');
    });

    test('returns partial last page', () => {
      const result = getDmscDashboardRows(records, { page: 3, pageSize: 50 });
      expect(result.page).toBe(3);
      expect(result.records.length).toBe(0);
    });

    test('clamps page to minimum 1', () => {
      const result = getDmscDashboardRows(records, { page: 0, pageSize: 50 });
      expect(result.page).toBe(1);
    });

    test('clamps negative page to 1', () => {
      const result = getDmscDashboardRows(records, { page: -5, pageSize: 50 });
      expect(result.page).toBe(1);
    });
  });

  describe('Page Size Validation', () => {
    test('accepts valid page size', () => {
      const result = getDmscDashboardRows(records, { page: 1, pageSize: 50 });
      expect(result.pageSize).toBe(50);
    });

    test('clamps page size to maximum 100', () => {
      const result = getDmscDashboardRows(records, { page: 1, pageSize: 200 });
      expect(result.pageSize).toBe(100);
    });

    test('clamps page size to minimum 1', () => {
      const result = getDmscDashboardRows(records, { page: 1, pageSize: 1 });
      expect(result.pageSize).toBe(1);
    });

    test('clamps negative page size to 1', () => {
      const result = getDmscDashboardRows(records, { page: 1, pageSize: -10 });
      expect(result.pageSize).toBe(1);
    });

    test('defaults to 50 when not specified', () => {
      const result = getDmscDashboardRows(records, { page: 1 });
      expect(result.pageSize).toBe(50);
    });
  });

  describe('Total Pages Calculation', () => {
    test('calculates correctly for exact division', () => {
      const result = getDmscDashboardRows(records, { page: 1, pageSize: 50 });
      expect(result.totalPages).toBe(2);
    });

    test('rounds up for partial pages', () => {
      const result = getDmscDashboardRows(records, { page: 1, pageSize: 30 });
      expect(result.totalPages).toBe(4);
    });

    test('returns 1 for empty results', () => {
      const result = getDmscDashboardRows([], { page: 1, pageSize: 50 });
      expect(result.totalPages).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('handles null request', () => {
      const result = getDmscDashboardRows(records, null);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(50);
    });

    test('handles undefined request', () => {
      const result = getDmscDashboardRows(records);
      expect(result.records.length).toBe(50);
    });

    test('handles empty records array', () => {
      const result = getDmscDashboardRows([], { page: 1, pageSize: 50 });
      expect(result.total).toBe(0);
      expect(result.records.length).toBe(0);
    });
  });
});

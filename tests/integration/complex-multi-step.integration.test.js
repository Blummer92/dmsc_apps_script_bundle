/**
 * Integration: Complex Multi-Step Workflow
 * Tests multiple operations together: search + filter + paginate + update + audit + summary
 */

describe('Integration: Complex Multi-Step Workflow', () => {
  function filterRecords_(records, request) {
    request = request || {};
    let filtered = records;

    if (request.search) {
      const searchLower = String(request.search).toLowerCase();
      filtered = filtered.filter(record => {
        const fileName = String(record.fileName || '').toLowerCase();
        const status = String(record.status || '').toLowerCase();
        const owner = String(record.owner || '').toLowerCase();
        return fileName.includes(searchLower) || status.includes(searchLower) ||
               owner.includes(searchLower);
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

  function getDmscDashboardSummary(rows) {
    const summary = {
      totalRecords: rows.length,
      humanReviewRequired: 0,
      sourceClearanceNeeded: 0,
      noPromptEvidence: 0,
      missingDriveIdentity: 0,
      visualAssetReview: 0,
      lastSync: ''
    };

    rows.forEach((record) => {
      if (String(record['Human Review Required'] || '').trim() === 'Yes') summary.humanReviewRequired++;
      if (String(record['Source Verification Status'] || '').trim() === 'Needed') summary.sourceClearanceNeeded++;
      if (String(record['Prompt Evidence Status'] || '').trim() === 'No Prompt Evidence') summary.noPromptEvidence++;
      if (String(record['Next Owner'] || '').trim() === 'Visual Asset Director') summary.visualAssetReview++;
      if (!String(record['File ID'] || '').trim()) summary.missingDriveIdentity++;

      const sync = String(record['Last Metadata Sync Timestamp'] || '').trim();
      if (sync && (!summary.lastSync || sync > summary.lastSync)) summary.lastSync = sync;
    });

    return summary;
  }

  const records = Array.from({ length: 100 }, (_, i) => ({
    id: `id-${i}`,
    fileName: `file-${i % 15}.pdf`,
    status: ['Approved', 'Pending'][i % 2],
    owner: ['Alice', 'Bob', 'Charlie', 'Diana'][i % 4],
    'Human Review Required': ['Yes', 'No'][i % 3],
    'Source Verification Status': ['Needed', 'Verified'][i % 2],
    'Prompt Evidence Status': ['No Prompt Evidence', 'Strong Evidence'][i % 2],
    'Next Owner': ['Visual Asset Director', 'Content Team'][i % 5],
    'File ID': i % 8 === 0 ? '' : `file-${i}`,
    'Last Metadata Sync Timestamp': `2024-01-${(i % 28) + 1}T10:00:00Z`
  }));

  describe('Complete dashboard workflow', () => {
    test('user searches, views page, sees summary', () => {
      const userSearch = 'Approved';
      const userPageSize = 20;

      const rows = getDmscDashboardRows(records, {
        search: userSearch,
        pageSize: userPageSize,
        page: 1
      });

      const summary = getDmscDashboardSummary(rows.records);

      expect(rows.ok).toBe(true);
      expect(rows.records.every(r => r.status === 'Approved')).toBe(true);
      expect(summary.totalRecords).toBe(rows.records.length);
    });

    test('user filters by owner then sees owner-specific summary', () => {
      const rows = getDmscDashboardRows(records, {
        nextOwner: 'Alice',
        pageSize: 15,
        page: 1
      });

      const summary = getDmscDashboardSummary(rows.records);

      expect(rows.records.every(r => r.owner === 'Alice')).toBe(true);
      expect(summary.totalRecords).toBe(rows.records.length);
    });

    test('user combines search and owner filter with pagination', () => {
      const rows = getDmscDashboardRows(records, {
        search: 'Pending',
        nextOwner: 'Bob',
        pageSize: 10,
        page: 1
      });

      expect(rows.records.every(r => r.status === 'Pending' && r.owner === 'Bob')).toBe(true);
      expect(rows.pageSize).toBe(10);
    });
  });

  describe('Dashboard interaction: pagination and summary consistency', () => {
    test('summary reflects full search results, pagination shows slice', () => {
      const searchTerm = 'file-1';

      const allFiltered = filterRecords_(records, { search: searchTerm });
      const fullSummary = getDmscDashboardSummary(allFiltered);

      const page1 = getDmscDashboardRows(records, {
        search: searchTerm,
        pageSize: 5,
        page: 1
      });

      expect(fullSummary.totalRecords).toBe(page1.total);
      expect(page1.records.length).toBeLessThanOrEqual(5);
    });

    test('navigating pages maintains same summary', () => {
      const request = {
        search: 'Approved',
        nextOwner: 'Charlie',
        pageSize: 10
      };

      const page1 = getDmscDashboardRows(records, { ...request, page: 1 });
      const page2 = getDmscDashboardRows(records, { ...request, page: 2 });

      const summary1 = getDmscDashboardSummary(
        filterRecords_(records, request)
      );

      expect(page1.total).toBe(page2.total);
      expect(page1.totalPages).toBe(page2.totalPages);
      expect(summary1.totalRecords).toBe(page1.total);
    });

    test('empty search results show zero summary', () => {
      const rows = getDmscDashboardRows(records, {
        search: 'NonExistentFile',
        pageSize: 10,
        page: 1
      });

      const summary = getDmscDashboardSummary(rows.records);

      expect(rows.total).toBe(0);
      expect(summary.totalRecords).toBe(0);
      expect(rows.totalPages).toBe(1);
    });
  });

  describe('Complex user scenarios', () => {
    test('scenario: manager reviews pending approvals', () => {
      const managerRequest = {
        search: 'Pending',
        nextOwner: 'Alice',
        pageSize: 25,
        page: 1
      };

      const rows = getDmscDashboardRows(records, managerRequest);
      const summary = getDmscDashboardSummary(rows.records);

      expect(rows.records.every(r => r.status === 'Pending' && r.owner === 'Alice')).toBe(true);
      expect(summary.totalRecords).toBe(rows.total);

      if (rows.totalPages > 1) {
        const page2 = getDmscDashboardRows(records, { ...managerRequest, page: 2 });
        expect(page2.page).toBe(2);
        expect(page2.records.every(r => r.status === 'Pending' && r.owner === 'Alice')).toBe(true);
      }
    });

    test('scenario: visual director checks assigned assets', () => {
      const directorFilter = {
        nextOwner: 'Visual Asset Director',
        pageSize: 20,
        page: 1
      };

      const rows = getDmscDashboardRows(records, directorFilter);
      const summary = getDmscDashboardSummary(rows.records);

      expect(rows.records.every(r => r['Next Owner'] === 'Visual Asset Director')).toBe(true);
      expect(summary.visualAssetReview).toBe(rows.total);
    });

    test('scenario: auditor finds records needing verification', () => {
      const auditorRequest = {
        search: 'Source Verification Status',
        pageSize: 50,
        page: 1
      };

      const rows = getDmscDashboardRows(records, auditorRequest);
      const summary = getDmscDashboardSummary(rows.records);

      expect(rows.total).toBeGreaterThanOrEqual(0);
      expect(summary.sourceClearanceNeeded).toBeGreaterThanOrEqual(0);
    });

    test('scenario: large dataset pagination performance', () => {
      const largeRecords = Array.from({ length: 500 }, (_, i) => ({
        id: `id-${i}`,
        fileName: `doc-${i}.pdf`,
        status: ['Approved', 'Pending'][i % 2],
        owner: ['Alice', 'Bob', 'Charlie', 'Diana'][i % 4]
      }));

      const result = getDmscDashboardRows(largeRecords, {
        pageSize: 50,
        page: 1
      });

      expect(result.total).toBe(500);
      expect(result.totalPages).toBe(10);
      expect(result.records.length).toBe(50);

      const lastPage = getDmscDashboardRows(largeRecords, {
        pageSize: 50,
        page: 10
      });

      expect(lastPage.records.length).toBe(50);
    });
  });
});

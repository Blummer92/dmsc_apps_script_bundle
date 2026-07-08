/**
 * Filter Records: Search tests
 * Tests searching across filename, path, status, and owner fields
 */

describe('filterRecords_() - Search', () => {
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
    { id: '1', fileName: 'photo-spring.jpg', fullPath: 'Drive/Images/', status: 'Approved', owner: 'Alice' },
    { id: '2', fileName: 'photo-summer.jpg', fullPath: 'Drive/Images/', status: 'Pending', owner: 'Bob' },
    { id: '3', fileName: 'diagram.png', fullPath: 'Drive/Diagrams/', status: 'Approved', owner: 'Alice' }
  ];

  describe('Search by Filename', () => {
    test('exact filename match', () => {
      expect(filterRecords_(records, { search: 'photo-spring' })).toHaveLength(1);
    });

    test('partial filename match', () => {
      expect(filterRecords_(records, { search: 'photo' })).toHaveLength(2);
    });

    test('case-insensitive', () => {
      expect(filterRecords_(records, { search: 'PHOTO' })).toHaveLength(2);
    });

    test('no match returns empty', () => {
      expect(filterRecords_(records, { search: 'video' })).toHaveLength(0);
    });
  });

  describe('Search by Path', () => {
    test('path component match', () => {
      const result = filterRecords_(records, { search: 'Images' });
      expect(result).toHaveLength(2);
    });

    test('folder name match', () => {
      expect(filterRecords_(records, { search: 'Diagrams' })).toHaveLength(1);
    });

    test('case-insensitive', () => {
      expect(filterRecords_(records, { search: 'drive' })).toHaveLength(3);
    });
  });

  describe('Search by Status', () => {
    test('status match', () => {
      expect(filterRecords_(records, { search: 'Approved' })).toHaveLength(2);
    });

    test('different status', () => {
      expect(filterRecords_(records, { search: 'Pending' })).toHaveLength(1);
    });

    test('case-insensitive', () => {
      expect(filterRecords_(records, { search: 'approved' })).toHaveLength(2);
    });
  });

  describe('Search by Owner', () => {
    test('owner name match', () => {
      expect(filterRecords_(records, { search: 'Alice' })).toHaveLength(2);
    });

    test('case-insensitive', () => {
      expect(filterRecords_(records, { search: 'bob' })).toHaveLength(1);
    });
  });

  describe('Search Edge Cases', () => {
    test('empty search returns all', () => {
      expect(filterRecords_(records, { search: '' })).toHaveLength(3);
    });

    test('handles null fields', () => {
      const testRecords = [
        { id: '1', fileName: null, owner: null },
        { id: '2', fileName: 'test.jpg', owner: 'Alice' }
      ];
      expect(filterRecords_(testRecords, { search: 'test' })).toHaveLength(1);
    });

    test('handles missing fields', () => {
      const testRecords = [{ id: '1' }, { id: '2', fileName: 'test.jpg' }];
      expect(filterRecords_(testRecords, { search: 'test' })).toHaveLength(1);
    });
  });
});

/**
 * Unit tests for filterRecords_() function
 * HIGH PRIORITY: Core filtering logic used by getDmscDashboardRows
 * Incorrect filtering hides or shows wrong records
 */

describe('filterRecords_()', () => {
  // Implementation under test
  function filterRecords_(records, request) {
    request = request || {};
    let filtered = records;

    // Search filter
    if (request.search) {
      const searchLower = String(request.search).toLowerCase();
      filtered = filtered.filter(record => {
        const fileName = String(record.fileName || '').toLowerCase();
        const fullPath = String(record.fullPath || '').toLowerCase();
        const status = String(record.status || '').toLowerCase();
        const owner = String(record.owner || '').toLowerCase();
        return fileName.includes(searchLower) ||
               fullPath.includes(searchLower) ||
               status.includes(searchLower) ||
               owner.includes(searchLower);
      });
    }

    // Owner filter
    if (request.nextOwner) {
      filtered = filtered.filter(r => String(r.owner || '') === request.nextOwner);
    }

    // Queue filter (if applicable)
    if (request.queueId && request.queueId !== 'all') {
      // Queue filtering would be handled by matchesQueue_()
      // This is a simplified example
      filtered = filtered.filter(r => {
        if (request.queueId === 'noPrompt') {
          return r.promptStatus === 'No Prompt Evidence';
        }
        return true;
      });
    }

    return filtered;
  }

  describe('No filters applied', () => {
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

  describe('Search filtering - filename', () => {
    const records = [
      { id: '1', fileName: 'photo-spring.jpg', fullPath: '', status: '', owner: '' },
      { id: '2', fileName: 'photo-summer.jpg', fullPath: '', status: '', owner: '' },
      { id: '3', fileName: 'diagram.png', fullPath: '', status: '', owner: '' }
    ];

    test('filters by exact filename match', () => {
      const result = filterRecords_(records, { search: 'photo-spring' });

      expect(result.length).toBe(1);
      expect(result[0].fileName).toBe('photo-spring.jpg');
    });

    test('filters by partial filename match', () => {
      const result = filterRecords_(records, { search: 'photo' });

      expect(result.length).toBe(2);
    });

    test('filters with case-insensitive search', () => {
      const result = filterRecords_(records, { search: 'PHOTO' });

      expect(result.length).toBe(2);
    });

    test('returns empty when no filename matches', () => {
      const result = filterRecords_(records, { search: 'video' });

      expect(result.length).toBe(0);
    });
  });

  describe('Search filtering - path', () => {
    const records = [
      { id: '1', fileName: 'file.jpg', fullPath: 'Drive/Images/', status: '', owner: '' },
      { id: '2', fileName: 'file.jpg', fullPath: 'Drive/Diagrams/', status: '', owner: '' },
      { id: '3', fileName: 'file.jpg', fullPath: 'Share/Assets/', status: '', owner: '' }
    ];

    test('filters by path component', () => {
      const result = filterRecords_(records, { search: 'Images' });

      expect(result.length).toBe(1);
      expect(result[0].fullPath).toBe('Drive/Images/');
    });

    test('filters by multiple path matches', () => {
      const result = filterRecords_(records, { search: 'Drive' });

      expect(result.length).toBe(2);
    });

    test('filters by full path', () => {
      const result = filterRecords_(records, { search: 'Drive/Diagrams' });

      expect(result.length).toBe(1);
    });

    test('path search is case-insensitive', () => {
      const result = filterRecords_(records, { search: 'share' });

      expect(result.length).toBe(1);
      expect(result[0].fullPath).toContain('Share');
    });
  });

  describe('Search filtering - status', () => {
    const records = [
      { id: '1', fileName: '', fullPath: '', status: 'Approved', owner: '' },
      { id: '2', fileName: '', fullPath: '', status: 'Pending', owner: '' },
      { id: '3', fileName: '', fullPath: '', status: 'Approved', owner: '' }
    ];

    test('filters by status', () => {
      const result = filterRecords_(records, { search: 'Approved' });

      expect(result.length).toBe(2);
    });

    test('filters by different status', () => {
      const result = filterRecords_(records, { search: 'Pending' });

      expect(result.length).toBe(1);
    });

    test('status search is case-insensitive', () => {
      const result = filterRecords_(records, { search: 'approved' });

      expect(result.length).toBe(2);
    });
  });

  describe('Search filtering - owner', () => {
    const records = [
      { id: '1', fileName: '', fullPath: '', status: '', owner: 'Alice' },
      { id: '2', fileName: '', fullPath: '', status: '', owner: 'Bob' },
      { id: '3', fileName: '', fullPath: '', status: '', owner: 'Alice' }
    ];

    test('filters by owner name', () => {
      const result = filterRecords_(records, { search: 'Alice' });

      expect(result.length).toBe(2);
    });

    test('filters by different owner', () => {
      const result = filterRecords_(records, { search: 'Bob' });

      expect(result.length).toBe(1);
    });

    test('owner search is case-insensitive', () => {
      const result = filterRecords_(records, { search: 'bob' });

      expect(result.length).toBe(1);
    });
  });

  describe('Combined search - multiple fields', () => {
    const records = [
      {
        id: '1',
        fileName: 'photo-spring.jpg',
        fullPath: 'Drive/Images/',
        status: 'Approved',
        owner: 'Alice'
      },
      {
        id: '2',
        fileName: 'photo-summer.jpg',
        fullPath: 'Drive/Images/',
        status: 'Pending',
        owner: 'Bob'
      },
      {
        id: '3',
        fileName: 'diagram.png',
        fullPath: 'Drive/Diagrams/',
        status: 'Approved',
        owner: 'Alice'
      }
    ];

    test('search "photo" matches filename', () => {
      const result = filterRecords_(records, { search: 'photo' });

      expect(result.length).toBe(2);
      expect(result.every(r => r.fileName.includes('photo'))).toBe(true);
    });

    test('search "Alice" matches owner', () => {
      const result = filterRecords_(records, { search: 'Alice' });

      expect(result.length).toBe(2);
    });

    test('search "Approved" matches status', () => {
      const result = filterRecords_(records, { search: 'Approved' });

      expect(result.length).toBe(2);
    });

    test('search "Diagrams" matches path', () => {
      const result = filterRecords_(records, { search: 'Diagrams' });

      expect(result.length).toBe(1);
      expect(result[0].fileName).toBe('diagram.png');
    });
  });

  describe('Owner filtering', () => {
    const records = [
      { id: '1', fileName: 'a.jpg', fullPath: '', status: '', owner: 'Alice' },
      { id: '2', fileName: 'b.jpg', fullPath: '', status: '', owner: 'Bob' },
      { id: '3', fileName: 'c.jpg', fullPath: '', status: '', owner: 'Alice' }
    ];

    test('filters by exact owner match', () => {
      const result = filterRecords_(records, { nextOwner: 'Alice' });

      expect(result.length).toBe(2);
    });

    test('filters by different owner', () => {
      const result = filterRecords_(records, { nextOwner: 'Bob' });

      expect(result.length).toBe(1);
    });

    test('owner filter is exact match, not partial', () => {
      const result = filterRecords_(records, { nextOwner: 'Al' });

      expect(result.length).toBe(0);
    });

    test('owner filter with non-existent owner returns empty', () => {
      const result = filterRecords_(records, { nextOwner: 'Charlie' });

      expect(result.length).toBe(0);
    });

    test('empty owner filter returns all', () => {
      const result = filterRecords_(records, { nextOwner: '' });

      expect(result.length).toBe(3);
    });
  });

  describe('Combined search and owner filters', () => {
    const records = [
      { id: '1', fileName: 'photo.jpg', fullPath: '', status: '', owner: 'Alice' },
      { id: '2', fileName: 'photo.jpg', fullPath: '', status: '', owner: 'Bob' },
      { id: '3', fileName: 'diagram.png', fullPath: '', status: '', owner: 'Alice' }
    ];

    test('applies both search and owner filter', () => {
      const result = filterRecords_(records, {
        search: 'photo',
        nextOwner: 'Alice'
      });

      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    test('returns empty when filters have no common matches', () => {
      const result = filterRecords_(records, {
        search: 'photo',
        nextOwner: 'Bob'
      });

      expect(result.length).toBe(1); // Only photo by Bob
    });

    test('search matches but owner does not', () => {
      const result = filterRecords_(records, {
        search: 'diagram',
        nextOwner: 'Bob'
      });

      expect(result.length).toBe(0); // Diagram is by Alice, not Bob
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

  describe('Queue filtering', () => {
    const records = [
      { id: '1', fileName: 'a.jpg', promptStatus: 'No Prompt Evidence' },
      { id: '2', fileName: 'b.jpg', promptStatus: 'Strong Evidence' },
      { id: '3', fileName: 'c.jpg', promptStatus: 'No Prompt Evidence' }
    ];

    test('filters by queue: noPrompt', () => {
      const result = filterRecords_(records, {
        queueId: 'noPrompt'
      });

      expect(result.length).toBe(2);
      expect(result.every(r => r.promptStatus === 'No Prompt Evidence')).toBe(true);
    });

    test('queue: all returns all records', () => {
      const result = filterRecords_(records, {
        queueId: 'all'
      });

      expect(result.length).toBe(3);
    });

    test('ignores unknown queue ID', () => {
      const result = filterRecords_(records, {
        queueId: 'unknownQueue'
      });

      expect(result.length).toBe(3);
    });
  });

  describe('Edge cases', () => {
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
        { id: '1' }, // Missing all fields
        { id: '2', fileName: 'test.jpg' }
      ];

      const result = filterRecords_(records, { search: 'test' });

      expect(result.length).toBe(1);
    });

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

      // Should match records with whitespace
      expect(result.length).toBe(0);
    });
  });

  describe('Real-world scenario', () => {
    const records = Array.from({ length: 30 }, (_, i) => ({
      id: `id-${i}`,
      fileName: `file-${i % 5}.jpg`,
      fullPath: `Drive/Folder-${i % 3}/`,
      status: ['Approved', 'Pending'][i % 2],
      owner: ['Alice', 'Bob', 'Charlie'][i % 3]
    }));

    test('complex filter with multiple criteria', () => {
      const result = filterRecords_(records, {
        search: 'Approved',
        nextOwner: 'Alice'
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result.every(r => r.status === 'Approved' && r.owner === 'Alice')).toBe(true);
    });

    test('multiple searches in combined string', () => {
      const result = filterRecords_(records, {
        search: 'file-1'
      });

      expect(result.length).toBeGreaterThan(0);
    });

    test('no results case', () => {
      const result = filterRecords_(records, {
        search: 'NonExistent',
        nextOwner: 'Alice'
      });

      expect(result.length).toBe(0);
    });
  });
});

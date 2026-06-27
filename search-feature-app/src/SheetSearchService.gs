const SheetSearchService = (function() {
  function search(normalizedQuery, filters, config) {
    if (!config.indexSpreadsheetId) {
      console.warn('Sheet search skipped because index spreadsheet ID is not configured.');
      return [];
    }

    const spreadsheet = SpreadsheetApp.openById(config.indexSpreadsheetId);
    const sheet = spreadsheet.getSheetByName(config.indexSheetName);

    if (!sheet) {
      throw new Error('Index sheet not found: ' + config.indexSheetName);
    }

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) {
      return [];
    }

    const headers = values[0].map(function(header) {
      return normalizeHeader_(header);
    });

    return values
      .slice(1)
      .map(function(row, index) {
        return rowToRecord_(headers, row, index + 2);
      })
      .filter(function(record) {
        return recordMatchesFilters_(record, filters) && recordMatchesQuery_(record, normalizedQuery);
      })
      .map(recordToResult_);
  }

  function rowToRecord_(headers, row, rowNumber) {
    const record = {
      rowNumber: rowNumber
    };

    headers.forEach(function(header, index) {
      if (header) {
        record[header] = row[index];
      }
    });

    return record;
  }

  function recordMatchesFilters_(record, filters) {
    return Object.keys(filters).every(function(field) {
      return filterMatchesValue_(record[field], filters[field]);
    });
  }

  function recordMatchesQuery_(record, normalizedQuery) {
    if (!normalizedQuery) {
      return true;
    }

    const fields = APP_CONFIG.FIELDS;
    const searchableFields = [
      fields.TITLE,
      fields.UNIT,
      fields.LESSON,
      fields.PACKET,
      fields.SOURCE_DOCUMENT,
      fields.OUTPUT_TYPE,
      fields.TARGET_DASHBOARD,
      fields.RELATED_NOTION_RECORDS,
      fields.READINESS_STATUS,
      fields.DESCRIPTION
    ];

    return searchableFields.some(function(field) {
      return valueMatchesQuery_(record[field], normalizedQuery);
    });
  }

  function recordToResult_(record) {
    const fields = APP_CONFIG.FIELDS;

    return {
      source: 'sheet',
      title: record[fields.TITLE] || record[fields.SOURCE_DOCUMENT] || 'Untitled curriculum record',
      type: record[fields.OUTPUT_TYPE] || 'metadata_record',
      fileUrl: record[fields.FILE_URL] || '',
      matchReason: buildMatchReason_(record),
      metadata: {
        unit: record[fields.UNIT] || '',
        lesson: record[fields.LESSON] || '',
        packet: record[fields.PACKET] || '',
        sourceDocument: record[fields.SOURCE_DOCUMENT] || '',
        outputType: record[fields.OUTPUT_TYPE] || '',
        targetDashboard: record[fields.TARGET_DASHBOARD] || '',
        relatedNotionRecords: record[fields.RELATED_NOTION_RECORDS] || '',
        readinessStatus: record[fields.READINESS_STATUS] || '',
        updatedAt: record[fields.UPDATED_AT] || '',
        rowNumber: record.rowNumber
      }
    };
  }

  function buildMatchReason_(record) {
    const fields = APP_CONFIG.FIELDS;
    const parts = [];

    if (record[fields.TITLE]) {
      parts.push('title');
    }
    if (record[fields.UNIT] || record[fields.LESSON] || record[fields.PACKET]) {
      parts.push('curriculum metadata');
    }
    if (record[fields.READINESS_STATUS]) {
      parts.push('readiness status');
    }

    return parts.length ? 'Matched ' + parts.join(', ') : 'Matched sheet row';
  }

  function normalizeHeader_(header) {
    return String(header || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  return {
    search: search
  };
})();

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
        return recordMatchesFilters_(record, filters, config) && recordMatchesQuery_(record, normalizedQuery);
      })
      .map(function(record) {
        return recordToResult_(record, config);
      });
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

  function recordMatchesFilters_(record, filters, config) {
    return Object.keys(filters).every(function(field) {
      if (field === APP_CONFIG.FIELDS.READINESS_STATUS) {
        return readinessMatchesFilter_(record[field], filters[field], config.readinessVocabulary);
      }

      return filterMatchesValue_(record[field], filters[field]);
    });
  }

  function readinessMatchesFilter_(value, normalizedFilter, vocabulary) {
    if (!normalizedFilter) {
      return true;
    }

    const normalizedValue = normalizeSearchText_(value);
    if (normalizedValue.indexOf(normalizedFilter) !== -1) {
      return true;
    }

    return (vocabulary || []).some(function(item) {
      const candidateValues = [item.value, item.label].concat(item.aliases || []);
      const normalizedCandidates = candidateValues.map(normalizeSearchText_);
      return normalizedCandidates.indexOf(normalizedFilter) !== -1 &&
        normalizedCandidates.indexOf(normalizedValue) !== -1;
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
      fields.SOURCE_SYSTEM,
      fields.CANONICAL_OWNER_DATABASE,
      fields.CANONICAL_RECORD_URL,
      fields.DUPLICATE_RESOLUTION_STATUS,
      fields.DESCRIPTION
    ];

    return searchableFields.some(function(field) {
      return valueMatchesQuery_(record[field], normalizedQuery);
    });
  }

  function recordToResult_(record, config) {
    const fields = APP_CONFIG.FIELDS;
    const sourceSystem = formatCellValue_(record[fields.SOURCE_SYSTEM]) || 'Google Sheets';
    const sourceLabel = normalizeSourceLabel_(sourceSystem, 'Google Sheets');
    const canonicalOwnerDatabase = formatCellValue_(record[fields.CANONICAL_OWNER_DATABASE]);
    const canonicalRecordUrl = formatCellValue_(record[fields.CANONICAL_RECORD_URL]);
    const duplicateResolutionStatus = formatCellValue_(record[fields.DUPLICATE_RESOLUTION_STATUS]) || 'review_required';
    const description = formatCellValue_(record[fields.DESCRIPTION]);
    const fileUrl = formatCellValue_(record[fields.FILE_URL]);

    return {
      source: 'sheet',
      sourceLabel: sourceLabel,
      title: formatCellValue_(record[fields.TITLE] || record[fields.SOURCE_DOCUMENT]) || 'Untitled curriculum record',
      type: formatCellValue_(record[fields.OUTPUT_TYPE]) || 'metadata_record',
      fileUrl: fileUrl,
      matchReason: buildMatchReason_(record),
      metadata: {
        unit: formatCellValue_(record[fields.UNIT]),
        lesson: formatCellValue_(record[fields.LESSON]),
        packet: formatCellValue_(record[fields.PACKET]),
        sourceDocument: formatCellValue_(record[fields.SOURCE_DOCUMENT]),
        outputType: formatCellValue_(record[fields.OUTPUT_TYPE]),
        targetDashboard: formatCellValue_(record[fields.TARGET_DASHBOARD]),
        relatedNotionRecords: formatCellValue_(record[fields.RELATED_NOTION_RECORDS]),
        readinessStatus: formatCellValue_(record[fields.READINESS_STATUS]),
        description: description,
        source_system: sourceLabel,
        canonical_owner_database: canonicalOwnerDatabase,
        canonical_record_url: canonicalRecordUrl,
        duplicate_resolution_status: duplicateResolutionStatus,
        approved_readiness_vocabulary: config.readinessVocabulary || [],
        file_url: fileUrl,
        sourceSystem: sourceLabel,
        canonicalOwnerDatabase: canonicalOwnerDatabase,
        canonicalRecordUrl: canonicalRecordUrl,
        duplicateResolutionStatus: duplicateResolutionStatus,
        approvedReadinessVocabulary: config.readinessVocabulary || [],
        fileUrl: fileUrl,
        updatedAt: formatCellValue_(record[fields.UPDATED_AT]),
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

  function formatCellValue_(value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value === null || typeof value === 'undefined') {
      return '';
    }
    return String(value);
  }

  function normalizeSourceLabel_(value, defaultLabel) {
    if (!value) {
      return defaultLabel || 'Unknown Source';
    }

    const normalized = String(value || '').toLowerCase().trim();

    if (normalized.indexOf('notion') !== -1) {
      return 'Notion';
    }
    if (normalized.indexOf('dashboard') !== -1) {
      return 'Dashboard';
    }
    if (normalized.indexOf('drive') !== -1) {
      return 'Google Drive';
    }
    if (normalized.indexOf('sheet') !== -1 || normalized.indexOf('spreadsheet') !== -1) {
      return 'Google Sheets';
    }

    return 'Unknown Source';
  }

  return {
    search: search
  };
})();

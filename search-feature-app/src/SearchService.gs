const CurriculumSearchService = (function() {
  function search(query, filters) {
    const startedAt = new Date();
    const normalizedQuery = normalizeSearchText_(query);
    const safeFilters = normalizeFilters_(filters);
    const config = getRuntimeConfig();

    if (!normalizedQuery && !hasActiveFilters_(safeFilters)) {
      return buildSearchResponse_(query, safeFilters, [], [], startedAt, []);
    }

    const warnings = [];
    let results = [];

    try {
      results = results.concat(SheetSearchService.search(normalizedQuery, safeFilters, config));
    } catch (error) {
      warnings.push('Sheet search failed: ' + error.message);
      console.error('Sheet search failed', {
        message: error.message,
        stack: error.stack
      });
    }

    if (config.enableDriveSearch) {
      try {
        results = results.concat(DriveSearchService.search(normalizedQuery, safeFilters, config));
      } catch (error) {
        warnings.push('Drive search failed: ' + error.message);
        console.error('Drive search failed', {
          message: error.message,
          stack: error.stack
        });
      }
    }

    const normalizedResults = results.map(function(result) {
      return normalizeResultMetadata_(result, config);
    });
    const rankedResults = rankAndLimitResults_(normalizedResults, normalizedQuery, config.resultLimit);
    const duplicateGroups = buildDuplicateGroups_(rankedResults);
    return buildSearchResponse_(query, safeFilters, rankedResults, duplicateGroups, startedAt, warnings);
  }

  function normalizeFilters_(filters) {
    const fields = APP_CONFIG.FIELDS;
    const allowed = [
      fields.UNIT,
      fields.LESSON,
      fields.PACKET,
      fields.OUTPUT_TYPE,
      fields.READINESS_STATUS
    ];

    return allowed.reduce(function(accumulator, field) {
      accumulator[field] = normalizeSearchText_(filters && filters[field]);
      return accumulator;
    }, {});
  }

  function hasActiveFilters_(filters) {
    return Object.keys(filters).some(function(key) {
      return Boolean(filters[key]);
    });
  }

  function rankAndLimitResults_(results, normalizedQuery, limit) {
    return results
      .map(function(result) {
        return Object.assign({}, result, {
          score: scoreResult_(result, normalizedQuery)
        });
      })
      .sort(function(a, b) {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return String(a.title || '').localeCompare(String(b.title || ''));
      })
      .slice(0, limit);
  }

  function scoreResult_(result, normalizedQuery) {
    if (!normalizedQuery) {
      return 1;
    }

    const title = normalizeSearchText_(result.title);
    const matchReason = normalizeSearchText_(result.matchReason);
    const metadata = normalizeSearchText_(JSON.stringify(result.metadata || {}));
    let score = 0;

    if (title === normalizedQuery) {
      score += 100;
    }
    if (title.indexOf(normalizedQuery) !== -1) {
      score += 50;
    }
    if (matchReason.indexOf(normalizedQuery) !== -1) {
      score += 20;
    }
    if (metadata.indexOf(normalizedQuery) !== -1) {
      score += 10;
    }

    return score;
  }

  function buildDuplicateGroups_(results) {
    const buckets = {};

    results.forEach(function(result) {
      const key = getDuplicateCandidateKey_(result);
      if (!key) {
        return;
      }

      if (!buckets[key]) {
        buckets[key] = [];
      }
      buckets[key].push(result);
    });

    return Object.keys(buckets)
      .filter(function(key) {
        return buckets[key].length > 1;
      })
      .map(function(key) {
        return {
          duplicateKey: key,
          count: buckets[key].length,
          records: buckets[key],
          resolutionStatus: 'review_required',
          mergePerformed: false
        };
      });
  }

  function getDuplicateCandidateKey_(result) {
    const metadata = result.metadata || {};
    const canonicalUrl = normalizeSearchText_(metadata.canonical_record_url || metadata.canonicalRecordUrl);
    if (canonicalUrl) {
      return 'canonical_url:' + canonicalUrl;
    }

    const fileUrl = normalizeSearchText_(metadata.file_url || result.fileUrl);
    if (fileUrl) {
      return 'file_url:' + fileUrl;
    }

    const parts = [
      result.title,
      metadata.unit,
      metadata.lesson,
      metadata.packet,
      metadata.source_document || metadata.sourceDocument
    ].map(normalizeSearchText_).filter(Boolean);

    return parts.length ? 'metadata:' + parts.join('|') : '';
  }

  function normalizeResultMetadata_(result, config) {
    const metadata = Object.assign({}, result.metadata || {});
    const sourceLabel = normalizeSourceLabelForResult_(
      result.sourceLabel || metadata.source_system || metadata.sourceSystem,
      result.source
    );

    metadata.source_system = sourceLabel;
    metadata.sourceSystem = sourceLabel;
    metadata.canonical_owner_database = metadata.canonical_owner_database || metadata.canonicalOwnerDatabase || '';
    metadata.canonicalOwnerDatabase = metadata.canonicalOwnerDatabase || metadata.canonical_owner_database;
    metadata.canonical_record_url = metadata.canonical_record_url || metadata.canonicalRecordUrl || '';
    metadata.canonicalRecordUrl = metadata.canonicalRecordUrl || metadata.canonical_record_url;
    metadata.duplicate_resolution_status = metadata.duplicate_resolution_status || metadata.duplicateResolutionStatus || 'review_required';
    metadata.duplicateResolutionStatus = metadata.duplicateResolutionStatus || metadata.duplicate_resolution_status;
    metadata.approved_readiness_vocabulary = metadata.approved_readiness_vocabulary || metadata.approvedReadinessVocabulary || config.readinessVocabulary || [];
    metadata.approvedReadinessVocabulary = metadata.approvedReadinessVocabulary || metadata.approved_readiness_vocabulary;
    metadata.description = metadata.description || '';
    metadata.file_url = metadata.file_url || metadata.fileUrl || result.fileUrl || '';
    metadata.fileUrl = metadata.fileUrl || metadata.file_url;
    metadata.source_document = metadata.source_document || metadata.sourceDocument || '';
    metadata.sourceDocument = metadata.sourceDocument || metadata.source_document;

    return Object.assign({}, result, {
      sourceLabel: sourceLabel,
      fileUrl: result.fileUrl || metadata.file_url,
      metadata: metadata
    });
  }

  function normalizeSourceLabelForResult_(value, adapterSource) {
    const normalized = normalizeSearchText_(value);
    if (!normalized) {
      if (adapterSource === 'drive') {
        return 'Google Drive';
      }
      if (adapterSource === 'sheet') {
        return 'Google Sheets';
      }
      return 'Unknown Source';
    }

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

  function buildSearchResponse_(query, filters, results, duplicateGroups, startedAt, warnings) {
    const elapsedMs = new Date().getTime() - startedAt.getTime();
    const duplicateCandidateCount = duplicateGroups.reduce(function(total, group) {
      return total + group.count;
    }, 0);

    return {
      query: query || '',
      filters: filters,
      resultCount: results.length,
      results: results,
      duplicateCandidateGroups: duplicateGroups,
      duplicateCandidateCount: duplicateCandidateCount,
      warnings: warnings,
      governance: {
        writesMetadata: false,
        duplicateReviewRequired: duplicateGroups.length > 0,
        duplicateGroupingOnly: true,
        automaticMergeEnabled: false,
        recommendedNextAgent: 'Dashboard Sync Agent'
      },
      elapsedMs: elapsedMs,
      searchedAt: new Date().toISOString()
    };
  }

  return {
    search: search
  };
})();

function normalizeSearchText_(value) {
  return String(value || '')
    .toLowerCase()
    .trim();
}

function valueMatchesQuery_(value, normalizedQuery) {
  if (!normalizedQuery) {
    return false;
  }

  return normalizeSearchText_(value).indexOf(normalizedQuery) !== -1;
}

function filterMatchesValue_(value, normalizedFilter) {
  if (!normalizedFilter) {
    return true;
  }

  return normalizeSearchText_(value).indexOf(normalizedFilter) !== -1;
}

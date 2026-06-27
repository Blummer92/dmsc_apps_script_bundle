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

    const rankedResults = rankAndLimitResults_(results, normalizedQuery, config.resultLimit);
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
    const canonicalUrl = normalizeSearchText_(metadata.canonicalRecordUrl);
    if (canonicalUrl) {
      return 'canonical_url:' + canonicalUrl;
    }

    const fileUrl = normalizeSearchText_(result.fileUrl);
    if (fileUrl) {
      return 'file_url:' + fileUrl;
    }

    const parts = [
      result.title,
      metadata.unit,
      metadata.lesson,
      metadata.packet,
      metadata.sourceDocument
    ].map(normalizeSearchText_).filter(Boolean);

    return parts.length ? 'metadata:' + parts.join('|') : '';
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

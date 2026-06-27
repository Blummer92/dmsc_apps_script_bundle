const CurriculumSearchService = (function() {
  function search(query, filters) {
    const startedAt = new Date();
    const normalizedQuery = normalizeSearchText_(query);
    const safeFilters = normalizeFilters_(filters);
    const config = getRuntimeConfig();

    if (!normalizedQuery && !hasActiveFilters_(safeFilters)) {
      return buildSearchResponse_(query, safeFilters, [], startedAt, []);
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
    return buildSearchResponse_(query, safeFilters, rankedResults, startedAt, warnings);
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

  function buildSearchResponse_(query, filters, results, startedAt, warnings) {
    const elapsedMs = new Date().getTime() - startedAt.getTime();

    return {
      query: query || '',
      filters: filters,
      resultCount: results.length,
      results: results,
      warnings: warnings,
      governance: {
        writesMetadata: false,
        duplicateReviewRequired: true,
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

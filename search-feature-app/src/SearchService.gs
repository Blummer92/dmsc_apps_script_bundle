function searchCurriculum(query, filters) {
  try {
    const runtimeConfig = getRuntimeConfig();
    const safeQuery = String(query || '').trim();
    const safeFilters = filters || {};

    const sheetResults = SheetSearchService.search(safeQuery, safeFilters, runtimeConfig);
    const driveResults = runtimeConfig.enableDriveSearch
      ? DriveSearchService.search(safeQuery, safeFilters, runtimeConfig)
      : [];

    const results = sheetResults.concat(driveResults)
      .sort((a, b) => b.score - a.score)
      .slice(0, runtimeConfig.maxResults);

    return {
      ok: true,
      query: safeQuery,
      filters: safeFilters,
      count: results.length,
      results: results,
      governance: {
        readOnly: true,
        blockedUntilReview: true,
        handoffRequired: true,
        note: 'Search is read-only. Dashboard/Notion sync decisions require Dashboard Sync Agent review.'
      }
    };
  } catch (err) {
    console.error('searchCurriculum failed', err);
    return {
      ok: false,
      query: query,
      filters: filters || {},
      count: 0,
      results: [],
      error: err.message
    };
  }
}

function normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function containsText(value, query) {
  if (!query) return true;
  return normalizeText(value).indexOf(normalizeText(query)) !== -1;
}

function passesFilters(item, filters) {
  const active = filters || {};
  const pairs = [
    ['unit', 'Unit'],
    ['lesson', 'Lesson'],
    ['packet', 'Packet'],
    ['outputType', 'Output Type'],
    ['readinessStatus', 'Readiness Status']
  ];

  return pairs.every(pair => {
    const filterValue = normalizeText(active[pair[0]]);
    if (!filterValue) return true;
    return normalizeText(item[pair[1]]) === filterValue;
  });
}

function scoreMatch(item, query) {
  const q = normalizeText(query);
  if (!q) return 1;

  let score = 0;
  if (normalizeText(item.Title).indexOf(q) !== -1) score += 10;
  if (normalizeText(item.Tags).indexOf(q) !== -1) score += 6;
  if (normalizeText(item.Description).indexOf(q) !== -1) score += 4;
  if (JSON.stringify(item).toLowerCase().indexOf(q) !== -1) score += 1;
  return score;
}

function buildMatchReason(item, query) {
  const q = normalizeText(query);
  if (!q) return 'No keyword filter; ranked by source order.';
  if (normalizeText(item.Title).indexOf(q) !== -1) return 'Title match';
  if (normalizeText(item.Tags).indexOf(q) !== -1) return 'Tag match';
  if (normalizeText(item.Description).indexOf(q) !== -1) return 'Description match';
  return 'Metadata match';
}

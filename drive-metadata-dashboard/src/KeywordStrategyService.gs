var KeywordStrategyService = (function() {
  const MODES = Object.freeze({
    CREATE_MISSING: 'CREATE_MISSING',
    MAP_EXISTING: 'MAP_EXISTING',
    REPORT_UNMAPPED: 'REPORT_UNMAPPED'
  });

  function getMode() {
    const value = String(PropertiesService.getScriptProperties().getProperty('DM_VISUAL_KEYWORD_MODE') || MODES.REPORT_UNMAPPED).toUpperCase().trim();
    if (value === MODES.CREATE_MISSING || value === 'CREATE') return MODES.CREATE_MISSING;
    if (value === MODES.MAP_EXISTING || value === 'MAP') return MODES.MAP_EXISTING;
    if (value === MODES.REPORT_UNMAPPED || value === 'REPORT') return MODES.REPORT_UNMAPPED;
    return MODES.REPORT_UNMAPPED;
  }

  function resolve(rawKeywords, propertySchema) {
    const mode = getMode();
    const keywords = normalizeKeywords_(rawKeywords);
    const schemaOptions = getSchemaOptions_(propertySchema);
    if (!keywords.length) {
      return { ok: false, mode: mode, values: [], missing: [], reason: 'No keyword source values available.' };
    }

    if (!schemaOptions.length || mode === MODES.CREATE_MISSING) {
      return { ok: true, mode: mode, values: keywords, missing: [], created: schemaOptions.length ? keywords.filter(function(keyword) { return schemaOptions.indexOf(keyword) === -1; }) : keywords, reason: '' };
    }

    const mapped = [];
    const missing = [];
    keywords.forEach(function(keyword) {
      const direct = schemaOptions.indexOf(keyword) !== -1 ? keyword : '';
      if (direct) {
        mapped.push(direct);
        return;
      }
      const closest = closestOption_(keyword, schemaOptions);
      if (mode === MODES.MAP_EXISTING && closest) {
        mapped.push(closest);
      } else {
        missing.push({ keyword: keyword, suggestion: closest || '' });
      }
    });

    if (missing.length) {
      return {
        ok: false,
        mode: mode,
        values: unique_(mapped),
        missing: missing,
        reason: 'Unmapped Notion keyword option(s): ' + missing.map(function(item) { return item.keyword + (item.suggestion ? ' -> suggested ' + item.suggestion : ''); }).join(', ')
      };
    }

    return { ok: true, mode: mode, values: unique_(mapped), missing: [], reason: '' };
  }

  function normalizeKeywords_(rawKeywords) {
    const values = Array.isArray(rawKeywords) ? rawKeywords : String(rawKeywords || '').split(/[,;\n]+/);
    return unique_(values.map(function(value) { return String(value || '').trim(); }).filter(Boolean));
  }

  function getSchemaOptions_(propertySchema) {
    if (!propertySchema) return [];
    const type = propertySchema.type;
    if (!propertySchema[type] || !propertySchema[type].options) return [];
    return propertySchema[type].options.map(function(option) { return option.name; });
  }

  function closestOption_(keyword, options) {
    const normalized = normalize_(keyword);
    const exact = options.filter(function(option) { return normalize_(option) === normalized; });
    if (exact.length) return exact[0];
    const contains = options.filter(function(option) {
      const normalizedOption = normalize_(option);
      return normalizedOption.indexOf(normalized) !== -1 || normalized.indexOf(normalizedOption) !== -1;
    });
    return contains[0] || '';
  }

  function normalize_(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function unique_(values) {
    return Array.from(new Set(values));
  }

  return {
    MODES: MODES,
    getMode: getMode,
    resolve: resolve
  };
})();

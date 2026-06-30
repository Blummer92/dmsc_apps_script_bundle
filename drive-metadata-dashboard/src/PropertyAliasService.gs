var PropertyAliasService = (function() {
  const ALIASES = {
    asset_title: ['Asset title', 'Asset Title', 'Title', 'Name', 'Asset Name'],
    asset_type: ['Asset type', 'Asset Type', 'Type', 'Asset Category', 'Category'],
    keywords: ['Keywords', 'Keyword', 'Tags', 'Fast Sort Tags', 'Search Keywords'],
    ai_prompt: ['AI prompt', 'AI Prompt', 'Prompt', 'Prompt Text', 'AI_Metadata', 'AI Metadata'],
    alt_text: ['Alt text', 'Alt Text', 'Alternative Text', 'Accessibility Alt Text'],
    accessibility_notes: ['Accessibility notes', 'Accessibility Notes', 'Accessibility', 'Visual Consistency Notes', 'Clarity Notes'],
    instructional_purpose: ['Instructional purpose', 'Instructional Purpose', 'Purpose', 'Asset Label', 'Learning Purpose'],
    style_family: ['Style family', 'Style Family', 'Visual System', 'Unit / Visual System', 'Design System'],
    file_id: ['file_id', 'File ID', 'Drive File ID', 'Google Drive File ID'],
    drive_link: ['Source file link in Google Drive', 'Drive Link', 'Drive URL', 'Google Drive URL', 'drive_url'],
    prompt_source: ['Prompt source', 'Prompt Source', 'Source Prompt Type'],
    prompt_source_text: ['Prompt source text', 'Prompt Source Text', 'Prompt Text Source', 'Original Prompt Text'],
    missing_fields: ['Missing Fields', 'Missing fields', 'Sync Missing Fields'],
    version: ['Version', 'Asset Version', 'source_version', 'Source Version'],
    approved_use: ['Approved use', 'Approved Use', 'Use Boundary', 'Allowed Use']
  };

  const REQUIRED_CANONICAL_FIELDS = [
    'asset_title',
    'asset_type',
    'keywords',
    'ai_prompt',
    'alt_text',
    'accessibility_notes',
    'instructional_purpose',
    'style_family',
    'file_id',
    'drive_link',
    'prompt_source',
    'prompt_source_text'
  ];

  function resolveAll(schema) {
    const result = { resolved: {}, missing: [], ambiguous: [] };
    REQUIRED_CANONICAL_FIELDS.concat(['missing_fields', 'version', 'approved_use']).forEach(function(canonical) {
      const resolution = resolve(schema, canonical);
      if (resolution.ok) {
        result.resolved[canonical] = resolution.property;
      } else if (resolution.ambiguous) {
        result.ambiguous.push(resolution);
      } else if (REQUIRED_CANONICAL_FIELDS.indexOf(canonical) !== -1) {
        result.missing.push(resolution);
      }
    });
    return result;
  }

  function resolve(schema, canonicalName) {
    const propertyNames = Object.keys(schema || {});
    const aliases = ALIASES[canonicalName] || [canonicalName];
    const exact = aliases.filter(function(alias) { return Object.prototype.hasOwnProperty.call(schema, alias); });
    if (exact.length === 1) return buildResolution_(canonicalName, exact[0], schema[exact[0]]);
    if (exact.length > 1) return chooseBest_(canonicalName, exact, schema);

    const normalizedAliases = aliases.map(normalize_);
    const loose = propertyNames.filter(function(name) {
      return normalizedAliases.indexOf(normalize_(name)) !== -1;
    });
    if (loose.length === 1) return buildResolution_(canonicalName, loose[0], schema[loose[0]]);
    if (loose.length > 1) return chooseBest_(canonicalName, loose, schema);

    return {
      ok: false,
      canonical: canonicalName,
      aliases: aliases,
      reason: 'Missing Notion property alias for ' + canonicalName + ': ' + aliases.join(' | ')
    };
  }

  function chooseBest_(canonicalName, names, schema) {
    const preferred = ALIASES[canonicalName] || [];
    for (let i = 0; i < preferred.length; i += 1) {
      if (names.indexOf(preferred[i]) !== -1) return buildResolution_(canonicalName, preferred[i], schema[preferred[i]]);
    }
    const title = names.filter(function(name) { return schema[name] && schema[name].type === 'title'; });
    if (title.length === 1) return buildResolution_(canonicalName, title[0], schema[title[0]]);
    return {
      ok: false,
      ambiguous: true,
      canonical: canonicalName,
      candidates: names,
      reason: 'Multiple Notion properties match aliases for ' + canonicalName + ': ' + names.join(', ')
    };
  }

  function buildResolution_(canonicalName, propertyName, propertySchema) {
    return {
      ok: true,
      canonical: canonicalName,
      property: propertyName,
      type: propertySchema ? propertySchema.type : '',
      schema: propertySchema
    };
  }

  function normalize_(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  return {
    ALIASES: ALIASES,
    REQUIRED_CANONICAL_FIELDS: REQUIRED_CANONICAL_FIELDS,
    resolve: resolve,
    resolveAll: resolveAll
  };
})();

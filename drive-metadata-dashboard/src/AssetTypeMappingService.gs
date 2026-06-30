var AssetTypeMappingService = (function() {
  const SOURCE_TO_APPROVED = {
    prop: ['poster visual', 'process visual', 'slide image'],
    ui_screenshot: ['slide image', 'process visual', 'poster visual'],
    worksheet_graphic: ['worksheet image', 'diagram', 'poster visual'],
    graphic: ['poster visual', 'diagram', 'slide image'],
    illustration: ['poster visual', 'slide image', 'worksheet image'],
    poster: ['poster visual'],
    poster_visual: ['poster visual'],
    product_asset: ['poster visual', 'slide image'],
    single_icon: ['icon'],
    icon_set: ['icon'],
    logo: ['poster visual', 'slide image'],
    interface: ['process visual', 'slide image'],
    mockup: ['slide image', 'poster visual'],
    reference: ['slide image', 'worksheet image'],
    diagram: ['diagram'],
    icon: ['icon'],
    icons: ['icon'],
    process_visual: ['process visual'],
    slide_image: ['slide image'],
    worksheet_image: ['worksheet image']
  };

  const DEFAULT_APPROVED = ['icon', 'diagram', 'worksheet image', 'slide image', 'process visual', 'poster visual'];

  function map(rawValue, propertySchema) {
    const source = String(rawValue || '').trim();
    if (!source) {
      return { ok: false, value: '', source: source, reason: 'Asset Type source value is blank.' };
    }
    const normalized = normalize_(source);
    const schemaOptions = getSchemaOptions_(propertySchema);
    const approvedOptions = schemaOptions.length ? schemaOptions : DEFAULT_APPROVED;

    if (approvedOptions.indexOf(source) !== -1) {
      return { ok: true, value: source, source: source, reason: '' };
    }

    const candidates = SOURCE_TO_APPROVED[normalized] || [];
    for (let i = 0; i < candidates.length; i += 1) {
      if (approvedOptions.indexOf(candidates[i]) !== -1) {
        return { ok: true, value: candidates[i], source: source, reason: '' };
      }
    }

    const loose = approvedOptions.filter(function(option) {
      return normalize_(option) === normalized;
    });
    if (loose.length) {
      return { ok: true, value: loose[0], source: source, reason: '' };
    }

    return {
      ok: false,
      value: '',
      source: source,
      candidates: candidates,
      approved_options: approvedOptions,
      reason: 'No approved Notion Asset Type mapping exists for source value: ' + source
    };
  }

  function getSchemaOptions_(propertySchema) {
    if (!propertySchema) return [];
    const type = propertySchema.type;
    if (!propertySchema[type] || !propertySchema[type].options) return [];
    return propertySchema[type].options.map(function(option) { return option.name; });
  }

  function normalize_(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  return {
    SOURCE_TO_APPROVED: SOURCE_TO_APPROVED,
    map: map
  };
})();

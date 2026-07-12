var ControlledVocabularyService = (function() {
  const APPROVED_OPTIONS = {
    'Asset type': ['icon', 'diagram', 'worksheet image', 'slide image', 'process visual', 'poster visual'],
    'Approved use': ['worksheet', 'slide', 'poster', 'student-facing', 'teacher-facing'],
    'Reuse status': ['approved', 'draft', 'needs revision', 'retired'],
    'Cognitive load rating': ['low', 'medium', 'high']
  };

  const SOURCE_TO_APPROVED = {
    'Asset type': {
      icon: ['icon'],
      icons: ['icon'],
      icon_set: ['icon'],
      iconset: ['icon'],
      single_icon: ['icon'],
      ui_icon: ['icon'],
      prop: ['poster visual', 'process visual', 'slide image'],
      prop_asset: ['poster visual', 'process visual', 'slide image'],
      graphic: ['poster visual', 'diagram', 'slide image'],
      illustration: ['poster visual', 'slide image', 'worksheet image'],
      poster: ['poster visual'],
      poster_visual: ['poster visual'],
      product_asset: ['poster visual', 'slide image'],
      product: ['poster visual', 'slide image'],
      visual_asset: ['poster visual', 'slide image'],
      background: ['poster visual', 'slide image'],
      logo: ['poster visual', 'slide image'],
      interface: ['process visual', 'slide image'],
      mockup: ['slide image', 'poster visual'],
      reference: ['slide image', 'worksheet image'],
      diagram: ['diagram'],
      worksheet: ['worksheet image'],
      worksheet_image: ['worksheet image'],
      worksheet_graphic: ['worksheet image'],
      asset_sheet: ['worksheet image'],
      slide: ['slide image'],
      slide_image: ['slide image'],
      ui_screenshot: ['slide image'],
      process: ['process visual'],
      process_visual: ['process visual']
    },
    'Approved use': {
      worksheet: ['worksheet'],
      worksheets: ['worksheet'],
      slide: ['slide'],
      slides: ['slide'],
      poster: ['poster'],
      posters: ['poster'],
      student: ['student-facing'],
      student_facing: ['student-facing'],
      teacher: ['teacher-facing'],
      teacher_facing: ['teacher-facing']
    },
    'Reuse status': {
      approved: ['approved'],
      source_approved: ['approved'],
      draft: ['draft'],
      needs_revision: ['needs revision'],
      revision_needed: ['needs revision'],
      retired: ['retired']
    },
    'Cognitive load rating': {
      low: ['low'],
      medium: ['medium'],
      med: ['medium'],
      high: ['high']
    }
  };

  function map(fieldName, rawValue, propertySchema) {
    const source = String(rawValue || '').trim();
    if (!source) {
      return { ok: false, value: '', source: source, reason: fieldName + ' source value is blank.' };
    }
    const normalized = normalize_(source);
    const schemaOptions = getSchemaOptions_(propertySchema);
    const approvedOptions = schemaOptions.length ? schemaOptions : APPROVED_OPTIONS[fieldName] || [];

    if (approvedOptions.indexOf(source) !== -1) {
      return { ok: true, value: source, source: source, reason: '' };
    }

    const candidates = (SOURCE_TO_APPROVED[fieldName] || {})[normalized] || [];
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
      reason: 'No approved Notion ' + fieldName + ' mapping exists for source value: ' + source
    };
  }

  function normalizeFlat(fieldName, rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) return { value: '', reason: 'no reviewed source value available' };
    const approvedOptions = APPROVED_OPTIONS[fieldName] || [];
    if (approvedOptions.indexOf(value) !== -1) return { value: value, reason: '' };
    const normalized = normalize_(value);
    const candidates = (SOURCE_TO_APPROVED[fieldName] || {})[normalized] || [];
    if (candidates.length) return { value: candidates[0], reason: '' };
    return { value: '', reason: 'source value is outside approved options: ' + value };
  }

  function approvedOptions(fieldName) {
    return APPROVED_OPTIONS[fieldName] || [];
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
    map: map,
    normalizeFlat: normalizeFlat,
    approvedOptions: approvedOptions
  };
})();

var VisualAssetLibraryPromptMetadataService = (function() {
  const GUESSED_PROMPT_APPROVAL_VALUE = 'YES_GUESSED_PROMPTS_APPROVED';
  const MAX_NOTION_RICH_TEXT_CONTENT_LENGTH = 1900;
  const MAX_ALT_TEXT_LENGTH = 360;
  const TRUNCATION_NOTICE = '\n\n[Truncated for Notion rich text limit. Review full source prompt in the source sheet.]';
  const PROMPT_SOURCES = [
    { field: 'approved_prompt', label: 'Approved Prompt', guessed: false },
    { field: 'proposed_cleaned_prompt', label: 'Proposed Cleaned Prompt', guessed: false },
    { field: 'original_image_prompt', label: 'Original Image Prompt', guessed: false },
    { field: 'openai_guessed_prompt', label: 'OpenAI Guess', guessed: true },
    { field: 'gemini_guessed_prompt', label: 'Gemini Guess', guessed: true },
    { field: 'copilot_prompt_guess', label: 'Copilot Guess', guessed: true }
  ];
  const SOURCE_LABELS = {
    asset_label: 'Asset Label',
    asset_category: 'Asset Category',
    unit_visual_system: 'Unit / Visual System',
    fast_sort_tags: 'Fast Sort Tags',
    visual_consistency_notes: 'Visual Consistency Notes'
  };
  const CONTROLLED_OPTIONS = {
    'Asset type': ['icon', 'diagram', 'worksheet image', 'slide image', 'process visual', 'poster visual'],
    'Approved use': ['worksheet', 'slide', 'poster', 'student-facing', 'teacher-facing'],
    'Reuse status': ['approved', 'draft', 'needs revision', 'retired'],
    'Cognitive load rating': ['low', 'medium', 'high']
  };
  const CONTROLLED_ALIASES = {
    'Asset type': {
      icon: 'icon',
      icons: 'icon',
      icon_set: 'icon',
      iconset: 'icon',
      single_icon: 'icon',
      ui_icon: 'icon',
      prop: 'poster visual',
      prop_asset: 'poster visual',
      graphic: 'poster visual',
      illustration: 'poster visual',
      product_asset: 'poster visual',
      product: 'poster visual',
      visual_asset: 'poster visual',
      background: 'poster visual',
      poster: 'poster visual',
      poster_visual: 'poster visual',
      diagram: 'diagram',
      worksheet: 'worksheet image',
      worksheet_image: 'worksheet image',
      worksheet_graphic: 'worksheet image',
      slide: 'slide image',
      slide_image: 'slide image',
      process: 'process visual',
      process_visual: 'process visual'
    },
    'Approved use': {
      worksheet: 'worksheet',
      worksheets: 'worksheet',
      slide: 'slide',
      slides: 'slide',
      poster: 'poster',
      posters: 'poster',
      student: 'student-facing',
      student_facing: 'student-facing',
      teacher: 'teacher-facing',
      teacher_facing: 'teacher-facing'
    },
    'Reuse status': {
      approved: 'approved',
      source_approved: 'approved',
      draft: 'draft',
      needs_revision: 'needs revision',
      revision_needed: 'needs revision',
      retired: 'retired'
    },
    'Cognitive load rating': {
      low: 'low',
      medium: 'medium',
      med: 'medium',
      high: 'high'
    }
  };

  function build(record, options) {
    const allowGuessedPrompts = Boolean(options && options.allowGuessedPrompts);
    const prompt = pickPrompt_(record, allowGuessedPrompts);
    const parsed = prompt.value ? parsePromptSections_(prompt.value) : {};
    const sourceSuffix = prompt.sourceLabel ? ' (' + prompt.sourceLabel + ')' : '';

    const assetLabel = firstNonEmpty_(record.asset_label, parsed['Asset Label']);
    const assetCategory = firstNonEmpty_(record.asset_category, parsed['Asset Category']);
    const unitVisualSystem = firstNonEmpty_(record.unit_visual_system, parsed['Unit / Visual System']);
    const fastSortTags = firstNonEmpty_(record.fast_sort_tags, parsed['Fast Sort Tags']);
    const visualConsistencyNotes = firstNonEmpty_(record.visual_consistency_notes, parsed['Visual Consistency Notes']);
    const fullPromptValue = buildFullPromptText_(prompt);
    const altTextValue = buildShortAltText_(record, assetLabel, assetCategory, unitVisualSystem, visualConsistencyNotes);

    return {
      prompt: prompt,
      fields: {
        'Alt text': { value: altTextValue, sourceColumn: prompt.sourceColumn, reason: altTextValue ? '' : prompt.reason },
        'AI prompt': { value: fullPromptValue, sourceColumn: prompt.sourceColumn, reason: prompt.reason },
        'Prompt source text': { value: fullPromptValue, sourceColumn: prompt.sourceColumn, reason: prompt.reason },
        'Prompt source': { value: prompt.sourceLabel, sourceColumn: prompt.sourceColumn, reason: prompt.reason },
        'Keywords': {
          value: parseKeywords_(fastSortTags),
          sourceColumn: sourceColumnFor_('fast_sort_tags', parsed, prompt, sourceSuffix),
          reason: fastSortTags ? '' : 'no keyword source value available'
        },
        'Asset type': normalizeControlledValue_('Asset type', assetCategory, sourceColumnFor_('asset_category', parsed, prompt, sourceSuffix)),
        'Style family': {
          value: capNotionRichText_(unitVisualSystem),
          sourceColumn: sourceColumnFor_('unit_visual_system', parsed, prompt, sourceSuffix),
          reason: unitVisualSystem ? '' : 'no style family source value available'
        },
        'Instructional purpose': {
          value: capNotionRichText_(assetLabel),
          sourceColumn: sourceColumnFor_('asset_label', parsed, prompt, sourceSuffix),
          reason: assetLabel ? '' : 'no instructional purpose source value available'
        },
        'Accessibility notes': {
          value: capNotionRichText_(visualConsistencyNotes),
          sourceColumn: sourceColumnFor_('visual_consistency_notes', parsed, prompt, sourceSuffix),
          reason: visualConsistencyNotes ? '' : 'no accessibility or visual consistency source value available'
        }
      }
    };
  }

  function pickPrompt_(record, allowGuessedPrompts) {
    for (let i = 0; i < PROMPT_SOURCES.length; i += 1) {
      const source = PROMPT_SOURCES[i];
      const value = String(record[source.field] || '').trim();
      if (!value) continue;
      if (source.guessed && !allowGuessedPrompts) {
        return {
          value: '',
          sourceColumn: source.field,
          sourceLabel: '',
          guessed: true,
          reason: 'guessed prompt excluded; set DM_VISUAL_ASSET_LIBRARY_ALLOW_GUESSED_PROMPTS=' + GUESSED_PROMPT_APPROVAL_VALUE
        };
      }
      return { value: value, sourceColumn: source.field, sourceLabel: source.label, guessed: source.guessed, reason: '' };
    }
    return {
      value: '',
      sourceColumn: PROMPT_SOURCES.map(function(source) { return source.field; }).join(' | '),
      sourceLabel: '',
      guessed: false,
      reason: 'no prompt source available'
    };
  }

  function parsePromptSections_(text) {
    const sections = {};
    const labels = Object.keys(SOURCE_LABELS).map(function(key) { return SOURCE_LABELS[key]; });
    labels.forEach(function(label, index) {
      const nextLabels = labels.slice(index + 1).map(escapeRegExp_).join('|');
      const pattern = nextLabels
        ? new RegExp('(?:^|\\n)\\s*' + escapeRegExp_(label) + '\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:' + nextLabels + ')\\s*:|$)', 'i')
        : new RegExp('(?:^|\\n)\\s*' + escapeRegExp_(label) + '\\s*:\\s*([\\s\\S]*)$', 'i');
      const match = text.match(pattern);
      if (match && match[1]) sections[label] = match[1].trim();
    });
    return sections;
  }

  function sourceColumnFor_(fieldName, parsed, prompt, sourceSuffix) {
    const sourceLabel = SOURCE_LABELS[fieldName];
    if (sourceLabel && parsed[sourceLabel]) return prompt.sourceColumn + ' -> ' + sourceLabel + sourceSuffix;
    return fieldName || '';
  }

  function normalizeControlledValue_(fieldName, rawValue, sourceColumn) {
    const value = String(rawValue || '').trim();
    if (!value) return { value: '', sourceColumn: sourceColumn || '', reason: 'no reviewed source value available' };
    const direct = CONTROLLED_OPTIONS[fieldName] || [];
    if (direct.indexOf(value) !== -1) return { value: value, sourceColumn: sourceColumn || '', reason: '' };
    const alias = (CONTROLLED_ALIASES[fieldName] || {})[normalize_(value)];
    if (alias) return { value: alias, sourceColumn: sourceColumn || '', reason: '' };
    return { value: '', sourceColumn: sourceColumn || '', reason: 'source value is outside approved options and needs mapping: ' + value };
  }

  function parseKeywords_(rawValue) {
    const text = String(rawValue || '').trim();
    if (!text) return [];
    const tags = text.split(/[,;\n]+/).map(function(tag) { return tag.trim(); }).filter(Boolean);
    return Array.from(new Set(tags));
  }

  function buildShortAltText_(record, assetLabel, assetCategory, unitVisualSystem, visualConsistencyNotes) {
    const subject = firstNonEmpty_(assetLabel, record.file_name, 'Visual asset');
    const context = unitVisualSystem ? ' for ' + unitVisualSystem : '';
    const category = assetCategory ? ' ' + assetCategory.toLowerCase() : '';
    const note = firstSentence_(visualConsistencyNotes);
    const firstSentence = subject + context + '.';
    const secondSentence = note || ('This' + category + ' is included for visual review and instructional asset tracking.');
    return capAltText_(firstSentence + ' ' + secondSentence);
  }

  function buildFullPromptText_(prompt) {
    if (!prompt.value) return '';
    const reviewLabel = prompt.sourceLabel ? '[' + prompt.sourceLabel + (prompt.guessed ? ' - review required' : '') + ']' : '[Prompt source]';
    return reviewLabel + '\n\n' + prompt.value;
  }

  function firstSentence_(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const match = text.match(/^(.+?[.!?])(?:\s|$)/);
    return match ? match[1].trim() : text;
  }

  function capAltText_(value) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= MAX_ALT_TEXT_LENGTH) return text;
    return text.slice(0, MAX_ALT_TEXT_LENGTH - 1).trim().replace(/[,.!?:;]+$/, '') + '.';
  }

  function capNotionRichText_(value) {
    const text = String(value || '').trim();
    if (text.length <= MAX_NOTION_RICH_TEXT_CONTENT_LENGTH) return text;
    const maxBodyLength = Math.max(0, MAX_NOTION_RICH_TEXT_CONTENT_LENGTH - TRUNCATION_NOTICE.length);
    return text.slice(0, maxBodyLength).trim() + TRUNCATION_NOTICE;
  }

  function firstNonEmpty_() {
    for (let i = 0; i < arguments.length; i += 1) {
      const value = String(arguments[i] || '').trim();
      if (value) return value;
    }
    return '';
  }

  function escapeRegExp_(value) {
    return String(value).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  function normalize_(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  return { build: build, CONTROLLED_OPTIONS: CONTROLLED_OPTIONS };
})();
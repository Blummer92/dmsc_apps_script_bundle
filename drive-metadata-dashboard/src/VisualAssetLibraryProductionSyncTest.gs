function testPropertyAliasServiceResolvesPromptAliases() {
  const schema = {
    'AI Prompt': { type: 'rich_text' },
    'Prompt Source': { type: 'select' },
    'Prompt Source Text': { type: 'rich_text' },
    'Asset title': { type: 'title' },
    'Asset type': { type: 'select' },
    'Keywords': { type: 'multi_select' },
    'Alt text': { type: 'rich_text' },
    'Accessibility notes': { type: 'rich_text' },
    'Instructional purpose': { type: 'rich_text' },
    'Style family': { type: 'rich_text' },
    'file_id': { type: 'rich_text' },
    'Source file link in Google Drive': { type: 'url' }
  };
  const result = PropertyAliasService.resolveAll(schema);
  assertEqual_('AI Prompt', result.resolved.ai_prompt, 'AI prompt alias should resolve regardless of casing.');
  assertEqual_(0, result.missing.length, 'Required aliases should not be missing.');
}

function testAssetTypeMappingServiceMapsKnownValues() {
  const schema = { type: 'select', select: { options: [{ name: 'icon' }, { name: 'diagram' }, { name: 'worksheet image' }, { name: 'slide image' }, { name: 'process visual' }, { name: 'poster visual' }] } };
  ['Prop', 'UI Screenshot', 'Worksheet Graphic', 'Graphic', 'Illustration', 'Poster', 'Product Asset', 'Single Icon', 'Icon Set', 'Logo', 'Interface', 'Mockup', 'Reference', 'Diagram'].forEach(function(value) {
    const result = AssetTypeMappingService.map(value, schema);
    assertEqual_(true, result.ok, value + ' should map to an approved Notion Asset Type.');
  });
}

function testKeywordStrategyReportsUnmappedByDefault() {
  const schema = { type: 'multi_select', multi_select: { options: [{ name: 'approved' }] } };
  const result = KeywordStrategyService.resolve(['approved', 'new keyword'], schema);
  assertEqual_(false, result.ok, 'Default keyword mode should report unmapped keywords.');
  assertEqual_(1, result.missing.length, 'One keyword should be reported as missing.');
}

function testKeywordStrategyCreateModeAllowsMissing() {
  const props = PropertiesService.getScriptProperties();
  const previous = props.getProperty('DM_VISUAL_KEYWORD_MODE');
  props.setProperty('DM_VISUAL_KEYWORD_MODE', 'CREATE_MISSING');
  try {
    const schema = { type: 'multi_select', multi_select: { options: [{ name: 'approved' }] } };
    const result = KeywordStrategyService.resolve(['approved', 'new keyword'], schema);
    assertEqual_(true, result.ok, 'CREATE_MISSING should allow new Notion keyword options.');
  } finally {
    if (previous === null || previous === undefined) props.deleteProperty('DM_VISUAL_KEYWORD_MODE');
    else props.setProperty('DM_VISUAL_KEYWORD_MODE', previous);
  }
}

function testVisualAssetLibraryProductionSyncTestSuite() {
  testPropertyAliasServiceResolvesPromptAliases();
  testAssetTypeMappingServiceMapsKnownValues();
  testKeywordStrategyReportsUnmappedByDefault();
  testKeywordStrategyCreateModeAllowsMissing();
  return { ok: true, tests: 4 };
}

function assertEqual_(expected, actual, message) {
  if (expected !== actual) {
    throw new Error(message + ' Expected: ' + expected + ' Actual: ' + actual);
  }
}

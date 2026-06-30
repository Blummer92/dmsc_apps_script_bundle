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

function testPropertyAliasServiceDoesNotRequirePromptSourceText() {
  const schema = {
    'AI Prompt': { type: 'rich_text' },
    'Prompt Source': { type: 'select' },
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
  assertEqual_(0, result.missing.length, 'Prompt Source Text should be optional when live schema only has AI Prompt and Prompt Source.');
}

function testAssetTypeMappingServiceMapsKnownValues() {
  const schema = { type: 'select', select: { options: [{ name: 'icon' }, { name: 'diagram' }, { name: 'worksheet image' }, { name: 'slide image' }, { name: 'process visual' }, { name: 'poster visual' }] } };
  ['Prop', 'UI Screenshot', 'Worksheet Graphic', 'Asset Sheet', 'Graphic', 'Illustration', 'Poster', 'Product Asset', 'Single Icon', 'Icon Set', 'Logo', 'Interface', 'Mockup', 'Reference', 'Diagram'].forEach(function(value) {
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

function testVisualAssetLibraryDryRunProofBlocksStaleCursor() {
  const props = PropertiesService.getScriptProperties();
  const schema = { 'Asset title': { type: 'title' }, 'AI Prompt': { type: 'rich_text' }, 'Prompt Source': { type: 'select' } };
  const context = { spreadsheetId: 'sheet-1', sheetName: 'DM Source Library Pilot', dataSourceId: 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd', syncScope: 'ELIGIBLE_STAGING_BATCH', cursorRow: 27, batchSize: 25 };
  const batch = { startRow: 27, endRow: 51, nextCursorRow: 52 };
  const previousProof = props.getProperty(VisualAssetLibraryDryRunProofService.PROOF_PROPERTY);
  try {
    VisualAssetLibraryDryRunProofService.save({ summary: {}, field_validation: [], row_progress: [] }, schema, context, batch);
    assertThrows_(function() {
      VisualAssetLibraryDryRunProofService.assertMatches(Object.assign({}, context, { cursorRow: 52 }), { startRow: 52, endRow: 76, nextCursorRow: 77 }, schema);
    }, 'cursor row changed', 'A stale dry-run proof must not authorize a different cursor.');
  } finally {
    if (previousProof === null || previousProof === undefined) props.deleteProperty(VisualAssetLibraryDryRunProofService.PROOF_PROPERTY);
    else props.setProperty(VisualAssetLibraryDryRunProofService.PROOF_PROPERTY, previousProof);
  }
}

function testVisualAssetLibraryDryRunProofAcceptsExactBatch() {
  const props = PropertiesService.getScriptProperties();
  const schema = { 'Asset title': { type: 'title' }, 'AI Prompt': { type: 'rich_text' }, 'Prompt Source': { type: 'select' } };
  const context = { spreadsheetId: 'sheet-1', sheetName: 'DM Source Library Pilot', dataSourceId: 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd', syncScope: 'ELIGIBLE_STAGING_BATCH', cursorRow: 27, batchSize: 25 };
  const batch = { startRow: 27, endRow: 51, nextCursorRow: 52 };
  const previousProof = props.getProperty(VisualAssetLibraryDryRunProofService.PROOF_PROPERTY);
  try {
    VisualAssetLibraryDryRunProofService.save({ summary: {}, field_validation: [], row_progress: [] }, schema, context, batch);
    const proof = VisualAssetLibraryDryRunProofService.assertMatches(context, batch, schema);
    assertEqual_(52, proof.next_cursor_row, 'Exact dry-run proof should preserve next cursor row.');
  } finally {
    if (previousProof === null || previousProof === undefined) props.deleteProperty(VisualAssetLibraryDryRunProofService.PROOF_PROPERTY);
    else props.setProperty(VisualAssetLibraryDryRunProofService.PROOF_PROPERTY, previousProof);
  }
}

function testVisualAssetLibrarySafeUpsertHelpersExist() {
  assertEqual_('function', typeof findNotionPagesByFileId, 'Global findNotionPagesByFileId helper should be deployed.');
  assertEqual_('function', typeof upsertVisualAssetPage, 'Global upsertVisualAssetPage helper should be deployed.');
  assertEqual_('function', typeof VisualAssetLibraryProductionSyncService.findNotionPagesByFileId, 'Service lookup helper should be exported.');
  assertEqual_('function', typeof VisualAssetLibraryProductionSyncService.upsertVisualAssetPage, 'Service upsert helper should be exported.');
}

function testVisualAssetLibraryProductionSyncTestSuite() {
  testPropertyAliasServiceResolvesPromptAliases();
  testPropertyAliasServiceDoesNotRequirePromptSourceText();
  testAssetTypeMappingServiceMapsKnownValues();
  testKeywordStrategyReportsUnmappedByDefault();
  testKeywordStrategyCreateModeAllowsMissing();
  testVisualAssetLibraryDryRunProofBlocksStaleCursor();
  testVisualAssetLibraryDryRunProofAcceptsExactBatch();
  testVisualAssetLibrarySafeUpsertHelpersExist();
  return { ok: true, tests: 8 };
}

function assertEqual_(expected, actual, message) {
  if (expected !== actual) {
    throw new Error(message + ' Expected: ' + expected + ' Actual: ' + actual);
  }
}

function assertThrows_(fn, expectedMessage, message) {
  try {
    fn();
  } catch (error) {
    if (String(error.message || error).indexOf(expectedMessage) === -1) {
      throw new Error(message + ' Expected error containing: ' + expectedMessage + ' Actual: ' + (error.message || error));
    }
    return;
  }
  throw new Error(message + ' Expected function to throw.');
}

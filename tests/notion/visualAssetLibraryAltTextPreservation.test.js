'use strict';

const { createAppsScriptHarness, createAppsScriptRuntime } = require('../helpers/appsScriptHarness.js');

function buildService() {
  const harness = createAppsScriptHarness({ runtime: createAppsScriptRuntime() });
  harness.loadFiles([
    'drive-metadata-dashboard/src/VisualAssetLibraryPromptMetadataService.gs'
  ]);
  return harness.getValue('VisualAssetLibraryPromptMetadataService');
}

describe('Visual Asset Library alt text preservation', () => {
  test('blank source alt text produces no proposed value so existing Notion text is preserved', () => {
    const service = buildService();

    const result = service.build({
      file_name: 'Existing asset.png',
      asset_label: 'Existing classroom asset',
      asset_category: 'icon',
      unit_visual_system: 'Candy Branding Design',
      visual_consistency_notes: 'Keep the detailed composition.'
    }, { allowGuessedPrompts: false });

    expect(result.fields['Alt text']).toEqual({
      value: '',
      sourceColumn: '',
      reason: 'no explicit source alt text available; preserve existing Notion value'
    });
  });

  test('contextual metadata alone no longer generates the generic fallback', () => {
    const service = buildService();

    const result = service.build({
      file_name: 'Asset.png',
      asset_category: 'diagram'
    }, { allowGuessedPrompts: false });

    expect(result.fields['Alt text'].value).toBe('');
    expect(result.fields['Alt text'].value).not.toContain('included for visual review and instructional asset tracking');
  });

  test('explicit canonical source alt text remains eligible for sync', () => {
    const service = buildService();
    const explicit = 'Detailed source-approved description of the classroom visual.';

    const result = service.build({ alt_text: explicit }, { allowGuessedPrompts: false });

    expect(result.fields['Alt text']).toEqual({
      value: explicit,
      sourceColumn: 'alt_text',
      reason: ''
    });
  });

  test('approved source aliases remain eligible while generated fallback stays disabled', () => {
    const service = buildService();
    const approved = 'Approved accessible description.';

    const result = service.build({ approved_alt_text: approved }, { allowGuessedPrompts: false });

    expect(result.fields['Alt text'].value).toBe(approved);
    expect(result.fields['Alt text'].sourceColumn).toBe('alt_text');
  });
});

'use strict';

const { createAppsScriptHarness, createAppsScriptRuntime } = require('../helpers/appsScriptHarness.js');

function buildHarness(properties = {}) {
  const runtime = createAppsScriptRuntime({ properties });
  const harness = createAppsScriptHarness({ runtime });
  harness.loadFiles(['drive-metadata-dashboard/src/NotionDryRun.gs']);
  return { harness, runtime };
}

describe('Notion write safety helper', () => {
  test('reports safe when mode is DRY_RUN and all write approvals are unset', () => {
    const { harness } = buildHarness({ DM_NOTION_SYNC_MODE: 'DRY_RUN' });

    expect(harness.getFunction('getNotionWriteSafetyStatus')()).toEqual({
      safe: true,
      mode: 'DRY_RUN',
      write_approvals_unset: true,
      write_approval_properties: {
        DM_NOTION_STAGING_WRITE_APPROVED: null,
        DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED: null,
        DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED: null
      }
    });
  });

  test('reports unsafe when any write approval is present', () => {
    const { harness } = buildHarness({
      DM_NOTION_SYNC_MODE: 'DRY_RUN',
      DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED: 'YES_VISUAL_ASSET_LIBRARY_ONLY'
    });

    const status = harness.getFunction('getNotionWriteSafetyStatus')();

    expect(status.safe).toBe(false);
    expect(status.write_approvals_unset).toBe(false);
    expect(status.write_approval_properties.DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED)
      .toBe('YES_VISUAL_ASSET_LIBRARY_ONLY');
  });

  test('forces DRY_RUN and deletes all known write approvals', () => {
    const { harness, runtime } = buildHarness({
      DM_NOTION_SYNC_MODE: 'STAGING_WRITE',
      DM_NOTION_STAGING_WRITE_APPROVED: 'YES_10_ROWS_ONLY',
      DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED: 'YES_EXPANDED_STAGING_BATCH_ONLY',
      DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED: 'YES_VISUAL_ASSET_LIBRARY_ONLY',
      DM_NOTION_API_TOKEN: 'preserve-me'
    });

    const status = harness.getFunction('setNotionDryRunAndUnsetWriteApprovals')();

    expect(status.safe).toBe(true);
    expect(status.mode).toBe('DRY_RUN');
    expect(status.write_approvals_unset).toBe(true);
    expect(runtime.scriptProperties.getProperty('DM_NOTION_SYNC_MODE')).toBe('DRY_RUN');
    expect(runtime.scriptProperties.getProperty('DM_NOTION_STAGING_WRITE_APPROVED')).toBeNull();
    expect(runtime.scriptProperties.getProperty('DM_NOTION_EXPANDED_STAGING_WRITE_APPROVED')).toBeNull();
    expect(runtime.scriptProperties.getProperty('DM_VISUAL_ASSET_LIBRARY_WRITE_APPROVED')).toBeNull();
    expect(runtime.scriptProperties.getProperty('DM_NOTION_API_TOKEN')).toBe('preserve-me');
  });

  test('is idempotent when approvals are already unset', () => {
    const { harness } = buildHarness({ DM_NOTION_SYNC_MODE: 'DRY_RUN' });
    const disableWrites = harness.getFunction('setNotionDryRunAndUnsetWriteApprovals');

    expect(disableWrites().safe).toBe(true);
    expect(disableWrites().safe).toBe(true);
  });
});

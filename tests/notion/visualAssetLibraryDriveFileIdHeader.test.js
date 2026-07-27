'use strict';

const { createAppsScriptHarness, createAppsScriptRuntime, createSpreadsheetFixture } = require('../helpers/appsScriptHarness.js');

const DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
const DATABASE_ID = 'aaaaaaaabbbbccccddddeeeeeeeeeeee';
const DATABASE_URL = 'https://www.notion.so/workspace/' + DATABASE_ID;
const TOKEN = 'secret_visual_asset_test_token';
const FILE_ID = 'drive-file-1';

const SCHEMA = {
  'Asset title': { type: 'title' },
  'Asset type': { type: 'select', select: { options: [{ name: 'diagram' }] } },
  Keywords: { type: 'multi_select', multi_select: { options: [{ name: 'algebra' }] } },
  'AI Prompt': { type: 'rich_text' },
  'Alt text': { type: 'rich_text' },
  'Accessibility notes': { type: 'rich_text' },
  'Instructional purpose': { type: 'rich_text' },
  'Style family': { type: 'rich_text' },
  file_id: { type: 'rich_text' },
  'Source file link in Google Drive': { type: 'url' },
  'Prompt Source': { type: 'rich_text' }
};

function notionResponse(status, body) {
  return {
    getResponseCode: () => status,
    getContentText: () => JSON.stringify(body || {}),
    getAllHeaders: () => ({})
  };
}

function sheetValues(fileId) {
  return [
    ['Drive File ID', 'drive_url', 'file_name', 'asset_category', 'fast_sort_tags', 'approved_prompt', 'alt_text', 'accessibility_notes', 'asset_label', 'unit_visual_system'],
    [fileId, fileId ? 'https://drive.google.com/file/d/' + fileId + '/view' : '', 'Asset One', 'diagram', 'algebra', 'A prompt', 'Alt text value', 'Notes', 'Purpose', 'System']
  ];
}

function buildHarness(fileId) {
  const requests = [];
  const { spreadsheet } = createSpreadsheetFixture({ 'Visual Sync History': [] });
  const runtime = createAppsScriptRuntime({
    spreadsheet,
    properties: {
      DM_SOURCE_LIBRARY_SPREADSHEET_ID: 'source-spreadsheet-id',
      DM_SOURCE_LIBRARY_SHEET_NAME: 'Source Library',
      DM_NOTION_STAGING_DATA_SOURCE_ID: DATA_SOURCE_ID,
      DM_NOTION_STAGING_DATABASE_URL: DATABASE_URL,
      DM_NOTION_API_TOKEN: TOKEN
    },
    fetchImpl(url, options) {
      const request = {
        url: String(url),
        method: String(options.method || '').toLowerCase(),
        payload: options.payload ? JSON.parse(options.payload) : null
      };
      requests.push(request);
      if (request.method === 'get' && /\/databases\/[^/]+$/.test(request.url)) {
        return notionResponse(200, { object: 'database', properties: SCHEMA });
      }
      if (request.method === 'post' && /\/query$/.test(request.url)) {
        return notionResponse(200, { results: [], has_more: false, next_cursor: null });
      }
      throw new Error('Unexpected Notion request: ' + request.method + ' ' + request.url);
    }
  });

  const harness = createAppsScriptHarness({
    runtime,
    globals: {
      Sheets: { Spreadsheets: { Values: { get: () => ({ values: sheetValues(fileId) }) } } }
    }
  });

  harness.loadFiles([
    'drive-metadata-dashboard/src/NotionTransport.gs',
    'drive-metadata-dashboard/src/SheetReadService.gs',
    'drive-metadata-dashboard/src/PropertyAliasService.gs',
    'drive-metadata-dashboard/src/AssetTypeMappingService.gs',
    'drive-metadata-dashboard/src/KeywordStrategyService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibraryPromptMetadataService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibrarySyncHistoryService.gs',
    'drive-metadata-dashboard/src/VisualAssetLibraryProductionSyncService.gs'
  ]);

  return {
    requests,
    service: harness.getValue('VisualAssetLibraryProductionSyncService')
  };
}

function isWrite(request) {
  return request.method === 'patch' || (request.method === 'post' && /\/pages$/.test(request.url));
}

describe('Visual Asset Library Drive File ID source mapping', () => {
  test('treats a populated Drive File ID as the canonical file_id and makes the row dry-run eligible', () => {
    const context = buildHarness(FILE_ID);

    const result = context.service.dryRun([2]);
    const item = result.row_progress[0];

    expect(item.file_id).toBe(FILE_ID);
    expect(item.status).toBe('waiting');
    expect(item.detail).toBe('No Notion page exists yet. Sync will create one.');
    expect(context.requests.filter(isWrite)).toHaveLength(0);
  });

  test('keeps a blank Drive File ID blank and safely skips the row', () => {
    const context = buildHarness('');

    const result = context.service.dryRun([2]);
    const item = result.row_progress[0];

    expect(item.file_id).toBe('');
    expect(item.status).toBe('failed');
    expect(item.detail).toMatch(/Missing file_id; cannot safely upsert/);
    expect(context.requests.filter(isWrite)).toHaveLength(0);
  });
});

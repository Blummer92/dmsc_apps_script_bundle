function runVisualAssetLibrarySyncBatch(mode) {
  const requestedMode = normalizeVisualSyncMode_(mode);
  if (!isVisualAssetLibraryTarget_()) {
    throw new Error('Blocked: Visual Asset Library controls only run against the approved Visual Asset Library target.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Blocked: another Visual Asset Library sync is already running. Try again after it finishes.');
  }

  const props = PropertiesService.getScriptProperties();
  try {
    if (requestedMode === 'DRY_RUN') {
      props.setProperty('DM_NOTION_SYNC_MODE', 'DRY_RUN');
      const validation = VisualAssetLibraryValidationService.dryRunFieldValidationOnly();
      return {
        ok: true,
        mode: 'DRY_RUN',
        validation_summary: validation.summary,
        row_progress: buildVisualAssetLibraryProgress_(validation, null),
        status: getVisualAssetLibrarySyncPanel()
      };
    }

    props.setProperty('DM_NOTION_SYNC_MODE', 'STAGING_WRITE');
    const writeResult = VisualAssetLibraryWriteService.syncEligibleBatch();
    if (writeResult.synced_count !== writeResult.verified_count) {
      throw new Error('Blocked: synced_count and verified_count do not match.');
    }

    if (writeResult.next_cursor_row) {
      props.setProperty('DM_NOTION_SYNC_CURSOR_ROW', String(writeResult.next_cursor_row));
    }
    props.setProperty('DM_NOTION_SYNC_MODE', 'DRY_RUN');

    return {
      ok: true,
      mode: 'STAGING_WRITE',
      write_result: writeResult,
      row_progress: buildVisualAssetLibraryProgress_(null, writeResult),
      status: getVisualAssetLibrarySyncPanel()
    };
  } finally {
    props.setProperty('DM_NOTION_SYNC_MODE', 'DRY_RUN');
    lock.releaseLock();
  }
}

function advanceVisualAssetLibrarySyncBatch() {
  const status = getVisualAssetLibrarySyncPanel();
  if (!status.next_cursor_row) {
    return Object.assign({}, status, {
      advanced: false,
      message: 'No next batch is available. The configured row range is complete.'
    });
  }

  PropertiesService.getScriptProperties().setProperty('DM_NOTION_SYNC_CURSOR_ROW', String(status.next_cursor_row));
  return Object.assign({}, getVisualAssetLibrarySyncPanel(), {
    advanced: true,
    message: 'Moved to the next batch of rows.'
  });
}

function resetVisualAssetLibrarySyncCursor() {
  const props = PropertiesService.getScriptProperties();
  const startRow = Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2);
  props.setProperty('DM_NOTION_SYNC_CURSOR_ROW', String(startRow));
  return Object.assign({}, getVisualAssetLibrarySyncPanel(), {
    reset: true,
    message: 'Reset to the first configured batch.'
  });
}

function normalizeVisualSyncMode_(mode) {
  const value = String(mode || 'DRY_RUN').toUpperCase().trim();
  if (value === 'DRY_RUN' || value === 'STAGING_WRITE') {
    return value;
  }
  throw new Error('Blocked: unsupported sync mode ' + mode + '. Use DRY_RUN or STAGING_WRITE.');
}

function buildVisualAssetLibraryProgress_(validationResult, writeResult) {
  if (writeResult) {
    return buildWriteProgress_(writeResult);
  }
  return buildDryRunProgress_(validationResult || {});
}

function buildWriteProgress_(writeResult) {
  const rows = {};
  (writeResult.synced || []).forEach(function(item) {
    rows[item.source_row] = {
      source_row: item.source_row,
      file_id: item.file_id || '',
      notion_page_url: item.page_url || '',
      status: 'synced',
      color: 'green',
      label: 'Synced with Notion',
      detail: item.action === 'updated' ? 'Existing Notion page updated and verified.' : 'New Notion page created and verified.'
    };
  });
  (writeResult.skipped || []).forEach(function(item) {
    rows[item.source_row] = {
      source_row: item.source_row,
      file_id: item.file_id || '',
      notion_page_url: '',
      status: 'not_syncing',
      color: 'red',
      label: 'Not syncing with Notion',
      detail: item.reason || 'Row was skipped.'
    };
  });
  return sortProgressRows_(rows);
}

function buildDryRunProgress_(validationResult) {
  const rows = {};
  ((validationResult.summary || {}).skipped_rows || []).forEach(function(item) {
    rows[item.source_row] = {
      source_row: item.source_row,
      file_id: item.file_id || '',
      notion_page_url: '',
      status: 'not_syncing',
      color: 'red',
      label: 'Not syncing with Notion',
      detail: item.reason || 'Row is not eligible for sync.'
    };
  });

  (validationResult.field_validation || []).forEach(function(field) {
    const rowNumber = field.source_row;
    if (!rows[rowNumber]) {
      rows[rowNumber] = {
        source_row: rowNumber,
        file_id: field.file_id || '',
        notion_page_url: field.notion_page_url || '',
        status: 'synced',
        color: 'green',
        label: 'Already synced with Notion',
        detail: 'No writable field differences found in this dry run.',
        writable: 0,
        skipped: 0,
        changes: 0,
        hasPage: Boolean(field.notion_page_id)
      };
    }

    const row = rows[rowNumber];
    row.file_id = row.file_id || field.file_id || '';
    row.notion_page_url = row.notion_page_url || field.notion_page_url || '';
    row.hasPage = row.hasPage || Boolean(field.notion_page_id);
    if (field.skipped) {
      row.skipped += 1;
      return;
    }

    row.writable += 1;
    if (String(field.old_value || '') !== String(field.proposed_value || '')) {
      row.changes += 1;
    }
  });

  Object.keys(rows).forEach(function(rowNumber) {
    const row = rows[rowNumber];
    if (row.status === 'not_syncing') return;
    if (!row.hasPage && row.writable > 0) {
      row.status = 'needs_resync';
      row.color = 'purple';
      row.label = 'Needs sync with Notion';
      row.detail = 'No matching Notion page was found; sync will create one.';
      return;
    }
    if (row.changes > 0) {
      row.status = 'needs_resync';
      row.color = 'purple';
      row.label = 'Needs resync with Notion';
      row.detail = row.changes + ' writable field change(s) detected.';
      return;
    }
    if (row.writable === 0) {
      row.status = 'not_syncing';
      row.color = 'red';
      row.label = 'Not syncing with Notion';
      row.detail = 'No writable Notion fields were available for this row.';
    }
  });

  return sortProgressRows_(rows);
}

function sortProgressRows_(rows) {
  return Object.keys(rows)
    .map(function(rowNumber) { return rows[rowNumber]; })
    .sort(function(a, b) { return Number(a.source_row) - Number(b.source_row); })
    .map(function(row) {
      return {
        source_row: row.source_row,
        file_id: row.file_id || '',
        notion_page_url: row.notion_page_url || '',
        status: row.status,
        color: row.color,
        label: row.label,
        detail: row.detail || ''
      };
    });
}

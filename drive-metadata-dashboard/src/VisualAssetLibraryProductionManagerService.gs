var VisualAssetLibraryProductionManagerService = (function() {
  const STATUS_COLUMNS = ['Sync Status', 'Sync %', 'Last Sync', 'Last Verified', 'Notion Page', 'Missing Fields', 'Validation Notes'];
  const STATUS_COLOR = {
    synced: '#dff5e8',
    partial: '#efe3ff',
    waiting: '#fff4cc',
    failed: '#ffe1dd',
    never_attempted: '#eef1f4',
    syncing: '#dceeff'
  };
  const STATUS_LABEL = {
    synced: 'Completely synced',
    partial: 'Partially synced',
    waiting: 'Waiting to sync',
    failed: 'Failed',
    never_attempted: 'Never attempted',
    syncing: 'Currently syncing'
  };

  function getDashboard() {
    const panel = getVisualAssetLibrarySyncPanel();
    const sheetState = readSheetState_();
    const health = buildHealth_(sheetState);
    return {
      status: panel,
      dashboard: summarizeSheet_(sheetState),
      health: health,
      next_action: nextAction_(panel, health),
      paused: isPaused_(),
      scope_options: [
        { value: 'current_batch', label: 'Current batch' },
        { value: 'selected_rows', label: 'Selected rows' },
        { value: 'failed', label: 'Only failed rows' },
        { value: 'partial', label: 'Only partial rows' },
        { value: 'missing', label: 'Only missing rows' },
        { value: 'entire_library', label: 'Entire library' }
      ]
    };
  }

  function run(action, scope) {
    const normalizedAction = normalizeAction_(action);
    const normalizedScope = normalizeScope_(scope);
    if (normalizedAction === 'PAUSE') return setPaused_(true);
    if (normalizedAction === 'RESUME') return setPaused_(false);
    if (normalizedAction === 'NEXT') return moveBatch_(1);
    if (normalizedAction === 'PREVIOUS') return moveBatch_(-1);
    if (isPaused_()) throw new Error('Paused: resume before running sync operations.');

    const rows = selectRows_(normalizedScope);
    markRows_(rows, 'syncing', 'Sync manager is processing this row.');
    let result;
    if (normalizedAction === 'SYNC') result = VisualAssetLibraryProductionSyncService.sync(rows);
    else if (normalizedAction === 'VERIFY') result = VisualAssetLibraryProductionSyncService.verify(rows);
    else result = VisualAssetLibraryProductionSyncService.dryRun(rows);
    writeProgress_(result.row_progress || [], normalizedAction);

    if (normalizedAction === 'SYNC' && result.summary && !result.summary.counts.failed && !result.summary.counts.partial && getVisualAssetLibrarySyncPanel().next_cursor_row) {
      moveBatch_(1);
    }

    return Object.assign({}, result, {
      ok: true,
      action: normalizedAction,
      scope: normalizedScope,
      manager: getDashboard()
    });
  }

  function writeProgress_(progress, action) {
    if (!progress.length) return;
    const sheet = getSheet_();
    const columns = ensureColumns_(sheet);
    const now = new Date();
    progress.forEach(function(item) {
      const duplicateUrls = (item.duplicate_page_urls || []).join(' | ');
      const notes = (item.validation_notes || []).join(' | ') || item.detail || '';
      const values = {
        'Sync Status': item.label,
        'Sync %': item.complete_fields + '/' + item.total_fields + ' ' + item.sync_percent + '%',
        'Last Sync': action === 'SYNC' ? now : '',
        'Last Verified': now,
        'Notion Page': item.notion_page_url || duplicateUrls || '',
        'Missing Fields': (item.missing_fields || []).join(', '),
        'Validation Notes': duplicateUrls ? notes + ' | Duplicate Notion page URLs: ' + duplicateUrls : notes
      };
      STATUS_COLUMNS.forEach(function(header) {
        if (values[header] !== '') sheet.getRange(item.source_row, columns[header]).setValue(values[header]);
      });
      sheet.getRange(item.source_row, 1, 1, sheet.getLastColumn()).setBackground(STATUS_COLOR[item.status] || STATUS_COLOR.never_attempted);
    });
    applyRowFormatting_(sheet, columns['Sync Status']);
  }

  function markRows_(rows, status, note) {
    if (!rows.length) return;
    const sheet = getSheet_();
    const columns = ensureColumns_(sheet);
    rows.forEach(function(row) {
      sheet.getRange(row, columns['Sync Status']).setValue(STATUS_LABEL[status]).setBackground(STATUS_COLOR[status]);
      sheet.getRange(row, columns['Validation Notes']).setValue(note || '');
      sheet.getRange(row, 1, 1, sheet.getLastColumn()).setBackground(STATUS_COLOR[status]);
    });
  }

  function ensureColumns_(sheet) {
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const columns = {};
    headers.forEach(function(header, index) { if (header) columns[String(header).trim()] = index + 1; });
    let nextColumn = lastColumn + 1;
    STATUS_COLUMNS.forEach(function(header) {
      if (!columns[header]) {
        sheet.getRange(1, nextColumn).setValue(header).setFontWeight('bold').setBackground('#e8f0fe');
        columns[header] = nextColumn;
        nextColumn += 1;
      }
    });
    return columns;
  }

  function applyRowFormatting_(sheet, statusColumn) {
    const lastRow = Math.max(sheet.getMaxRows(), 2);
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const rowRange = sheet.getRange(2, 1, lastRow - 1, lastColumn);
    const existing = sheet.getConditionalFormatRules().filter(function(rule) {
      return !rule.getRanges().some(function(range) { return range.getSheet().getSheetId() === sheet.getSheetId() && range.getColumn() === 1 && range.getNumColumns() === lastColumn; });
    });
    const rules = [
      ['Completely synced', STATUS_COLOR.synced],
      ['Partially synced', STATUS_COLOR.partial],
      ['Waiting to sync', STATUS_COLOR.waiting],
      ['Failed', STATUS_COLOR.failed],
      ['Never attempted', STATUS_COLOR.never_attempted],
      ['Currently syncing', STATUS_COLOR.syncing]
    ].map(function(item) {
      return SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$' + columnLetter_(statusColumn) + '2="' + item[0] + '"')
        .setBackground(item[1])
        .setRanges([rowRange])
        .build();
    });
    sheet.setConditionalFormatRules(existing.concat(rules));
  }

  function selectRows_(scope) {
    const panel = getVisualAssetLibrarySyncPanel();
    if (scope === 'current_batch') return rangeRows_(panel.batch_start_row, panel.batch_end_row);
    if (scope === 'selected_rows') return selectedRows_();
    const state = readSheetState_();
    if (scope === 'entire_library') return state.rows.map(function(row) { return row.rowNumber; });
    const wanted = scope === 'failed' ? [STATUS_LABEL.failed] : scope === 'partial' ? [STATUS_LABEL.partial] : [STATUS_LABEL.waiting, STATUS_LABEL.never_attempted];
    return state.rows.filter(function(row) { return wanted.indexOf(row.syncStatus) !== -1; }).map(function(row) { return row.rowNumber; });
  }

  function readSheetState_() {
    const config = getRuntimeConfig();
    const maxEnd = Number(PropertiesService.getScriptProperties().getProperty('DM_NOTION_SYNC_MAX_END_ROW') || 454);
    const read = SheetReadService.readSpreadsheetRowsById(config.sourceLibrarySpreadsheetId || config.dashboardSpreadsheetId, config.sourceLibrarySheetName, 2, maxEnd);
    const rows = (read.records || []).filter(function(record) { return record.file_id || record.drive_url || record.file_name; }).map(function(record) {
      return { rowNumber: record.rowNumber, fileId: record.file_id || '', syncStatus: record.sync_status || STATUS_LABEL.never_attempted, syncPercent: parsePercent_(record.sync || record.sync_percent), validationNotes: record.validation_notes || '', notionPage: record.notion_page || '' };
    });
    return { rows: rows, warnings: read.warnings || [] };
  }

  function summarizeSheet_(state) {
    const counts = { green: 0, purple: 0, red: 0, yellow: 0, gray: 0, blue: 0 };
    state.rows.forEach(function(row) { counts[colorForLabel_(row.syncStatus)] += 1; });
    const total = state.rows.length;
    return { total_images: total, synced_images: counts.green, sync_percent: total ? Math.round((counts.green / total) * 100) : 0, counts: counts };
  }

  function buildHealth_(state) {
    const fileCounts = {};
    state.rows.forEach(function(row) { if (row.fileId) fileCounts[row.fileId] = (fileCounts[row.fileId] || 0) + 1; });
    const duplicates = Object.keys(fileCounts).filter(function(fileId) { return fileCounts[fileId] > 1; });
    return {
      total_sheet_images: state.rows.length,
      duplicate_file_id_count: duplicates.length,
      duplicate_file_ids: duplicates.slice(0, 25),
      missing_notion_page_count: state.rows.filter(function(row) { return row.syncStatus === STATUS_LABEL.waiting || row.syncStatus === STATUS_LABEL.never_attempted; }).length,
      failed_count: state.rows.filter(function(row) { return row.syncStatus === STATUS_LABEL.failed; }).length,
      partial_count: state.rows.filter(function(row) { return row.syncStatus === STATUS_LABEL.partial; }).length,
      schema_mismatch_count: state.rows.filter(function(row) { return String(row.validationNotes).indexOf('Missing Notion property alias') !== -1; }).length,
      verification_failure_count: state.rows.filter(function(row) { return String(row.validationNotes).indexOf('Expected and actual values differ') !== -1; }).length,
      next_safe_fix: 'Dry Run current batch, then Sync only rows that are Waiting or Partially synced.'
    };
  }

  function getSheet_() {
    const config = getRuntimeConfig();
    const spreadsheet = SpreadsheetApp.openById(config.sourceLibrarySpreadsheetId || config.dashboardSpreadsheetId || SpreadsheetApp.getActiveSpreadsheet().getId());
    const sheet = spreadsheet.getSheetByName(config.sourceLibrarySheetName);
    if (!sheet) throw new Error('Source library sheet not found: ' + config.sourceLibrarySheetName);
    return sheet;
  }

  function selectedRows_() {
    const sheet = getSheet_();
    const range = sheet.getActiveRange();
    if (!range) throw new Error('Select source rows before using selected-row sync.');
    return rangeRows_(Math.max(2, range.getRow()), range.getLastRow());
  }

  function moveBatch_(direction) {
    const props = PropertiesService.getScriptProperties();
    const panel = getVisualAssetLibrarySyncPanel();
    const batchSize = Number(panel.batch_size || 25);
    const start = Number(panel.start_row || 2);
    const end = Number(panel.end_row || panel.max_end_row || 454);
    const cursor = Number(panel.cursor_row || start);
    const next = direction > 0 ? Math.min(end, Number(panel.next_cursor_row || cursor)) : Math.max(start, cursor - batchSize);
    props.setProperty('DM_NOTION_SYNC_CURSOR_ROW', String(next));
    return { ok: true, action: direction > 0 ? 'NEXT' : 'PREVIOUS', manager: getDashboard() };
  }

  function setPaused_(paused) {
    PropertiesService.getScriptProperties().setProperty('DM_VISUAL_SYNC_PAUSED', paused ? 'YES' : 'NO');
    return { ok: true, action: paused ? 'PAUSE' : 'RESUME', manager: getDashboard() };
  }

  function nextAction_(panel, health) {
    if (isPaused_()) return 'Resume sync manager.';
    if (!panel.ready) return 'Resolve blocked configuration or approval checks.';
    if (health.failed_count) return 'Sync Failed or inspect failed rows.';
    if (health.partial_count) return 'Sync Partial to complete stale metadata.';
    if (panel.next_cursor_row) return 'Dry Run, review, then Sync current batch.';
    return 'Run Health Dashboard drift checks.';
  }

  function isPaused_() { return PropertiesService.getScriptProperties().getProperty('DM_VISUAL_SYNC_PAUSED') === 'YES'; }
  function normalizeAction_(action) { const value = String(action || 'DRY_RUN').toUpperCase().replace(/[^A-Z0-9]+/g, '_'); return value === 'STAGING_WRITE' ? 'SYNC' : value; }
  function normalizeScope_(scope) { const value = String(scope || 'current_batch').toLowerCase().replace(/[^a-z0-9]+/g, '_'); return ['current_batch', 'selected_rows', 'failed', 'partial', 'missing', 'entire_library'].indexOf(value) !== -1 ? value : 'current_batch'; }
  function rangeRows_(start, end) { const rows = []; for (let row = Number(start); row <= Number(end); row += 1) rows.push(row); return rows.filter(function(row) { return row >= 2; }); }
  function parsePercent_(value) { const match = String(value || '').match(/(\d+)%/); return match ? Number(match[1]) : 0; }
  function colorForLabel_(label) { return label === STATUS_LABEL.synced ? 'green' : label === STATUS_LABEL.partial ? 'purple' : label === STATUS_LABEL.failed ? 'red' : label === STATUS_LABEL.waiting ? 'yellow' : label === STATUS_LABEL.syncing ? 'blue' : 'gray'; }
  function columnLetter_(column) { let temp = Number(column); let letter = ''; while (temp > 0) { const mod = (temp - 1) % 26; letter = String.fromCharCode(65 + mod) + letter; temp = Math.floor((temp - mod) / 26); } return letter; }

  return { getDashboard: getDashboard, run: run };
})();

function getVisualAssetLibraryProductionManager() {
  return VisualAssetLibraryProductionManagerService.getDashboard();
}

function runVisualAssetLibraryProductionManager(action, scope) {
  return VisualAssetLibraryProductionManagerService.run(action, scope);
}

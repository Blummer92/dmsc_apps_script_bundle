var VisualAssetLibrarySyncManagerService = (function() {
  const FIELD_COUNT = 18;
  const STATUS_COLUMNS = [
    'Sync Status',
    'Sync %',
    'Last Sync',
    'Last Verified',
    'Notion Page',
    'Missing Fields',
    'Validation Notes'
  ];
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
  const WRITABLE_ACTIONS = ['DRY_RUN', 'SYNC', 'VERIFY'];

  function getDashboard() {
    const panel = getVisualAssetLibrarySyncPanel();
    const sheetState = readSheetState_();
    const health = buildHealthReport_(sheetState);
    return {
      status: panel,
      dashboard: buildDashboardSummary_(sheetState),
      health: health,
      next_action: getNextAction_(panel, sheetState, health),
      columns: STATUS_COLUMNS,
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

    if (isPaused_()) {
      throw new Error('Paused: resume the Visual Asset Library sync manager before running ' + normalizedAction + '.');
    }
    if (WRITABLE_ACTIONS.indexOf(normalizedAction) === -1) {
      throw new Error('Unsupported sync manager action: ' + normalizedAction);
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      throw new Error('Blocked: another Visual Asset Library sync is already running. Try again after it finishes.');
    }

    try {
      writeRowsAsSyncing_(normalizedScope);
      const rawResult = runAction_(normalizedAction, normalizedScope);
      const progress = buildProgress_(normalizedAction, rawResult);
      writeProgressToSheet_(progress, normalizedAction);
      return {
        ok: true,
        action: normalizedAction,
        scope: normalizedScope,
        summary: summarizeProgress_(progress),
        row_progress: progress,
        raw_result: rawResult,
        manager: getDashboard()
      };
    } catch (error) {
      markScopeFailed_(normalizedScope, error.message || String(error));
      throw error;
    } finally {
      PropertiesService.getScriptProperties().setProperty('DM_NOTION_SYNC_MODE', 'DRY_RUN');
      lock.releaseLock();
    }
  }

  function runAction_(action, scope) {
    if (scope === 'current_batch') return runCurrentBatchAction_(action);
    const rows = selectRows_(scope);
    if (!rows.length) {
      return { empty: true, selected_rows: [], message: 'No rows matched scope: ' + scope };
    }
    return runRowSetAction_(action, rows);
  }

  function runCurrentBatchAction_(action) {
    const props = PropertiesService.getScriptProperties();
    if (action === 'SYNC') {
      props.setProperty('DM_NOTION_SYNC_MODE', 'STAGING_WRITE');
      return VisualAssetLibraryWriteService.syncEligibleBatch();
    }
    props.setProperty('DM_NOTION_SYNC_MODE', 'DRY_RUN');
    return VisualAssetLibraryValidationService.dryRunFieldValidationOnly();
  }

  function runRowSetAction_(action, rows) {
    const props = PropertiesService.getScriptProperties();
    const original = snapshotProperties_(props, [
      'DM_NOTION_SYNC_MODE',
      'DM_NOTION_SYNC_START_ROW',
      'DM_NOTION_SYNC_END_ROW',
      'DM_NOTION_SYNC_CURSOR_ROW',
      'DM_NOTION_SYNC_BATCH_SIZE'
    ]);
    const results = [];
    try {
      rows.forEach(function(rowNumber) {
        props.setProperty('DM_NOTION_SYNC_START_ROW', String(rowNumber));
        props.setProperty('DM_NOTION_SYNC_END_ROW', String(rowNumber));
        props.setProperty('DM_NOTION_SYNC_CURSOR_ROW', String(rowNumber));
        props.setProperty('DM_NOTION_SYNC_BATCH_SIZE', '1');
        if (action === 'SYNC') {
          props.setProperty('DM_NOTION_SYNC_MODE', 'STAGING_WRITE');
          results.push(VisualAssetLibraryWriteService.syncEligibleBatch());
        } else {
          props.setProperty('DM_NOTION_SYNC_MODE', 'DRY_RUN');
          results.push(VisualAssetLibraryValidationService.dryRunFieldValidationOnly());
        }
      });
    } finally {
      restoreProperties_(props, original);
    }
    return combineRowSetResults_(action, rows, results);
  }

  function combineRowSetResults_(action, rows, results) {
    if (action === 'SYNC') {
      return results.reduce(function(combined, result) {
        combined.mode = result.mode || combined.mode;
        combined.sync_scope = result.sync_scope || combined.sync_scope;
        combined.batch_start_row = Math.min(combined.batch_start_row || result.batch_start_row, result.batch_start_row || rows[0]);
        combined.batch_end_row = Math.max(combined.batch_end_row || result.batch_end_row, result.batch_end_row || rows[rows.length - 1]);
        combined.read_count += Number(result.read_count || 0);
        combined.skipped_count += Number(result.skipped_count || 0);
        combined.synced_count += Number(result.synced_count || 0);
        combined.verified_count += Number(result.verified_count || 0);
        Array.prototype.push.apply(combined.skipped, result.skipped || []);
        Array.prototype.push.apply(combined.synced, result.synced || []);
        Array.prototype.push.apply(combined.verified, result.verified || []);
        Array.prototype.push.apply(combined.field_skips, result.field_skips || []);
        return combined;
      }, { mode: 'STAGING_WRITE', selected_rows: rows, read_count: 0, skipped_count: 0, synced_count: 0, verified_count: 0, skipped: [], synced: [], verified: [], field_skips: [] });
    }

    const fieldValidation = [];
    const skippedRows = [];
    let writable = 0;
    let skippedFields = 0;
    results.forEach(function(result) {
      Array.prototype.push.apply(fieldValidation, result.field_validation || []);
      Array.prototype.push.apply(skippedRows, (result.summary || {}).skipped_rows || []);
      writable += Number((result.summary || {}).writable_field_count || 0);
      skippedFields += Number((result.summary || {}).skipped_field_count || 0);
    });
    return {
      summary: {
        mode: 'DRY_RUN',
        selected_rows: rows,
        batch_start_row: rows[0],
        batch_end_row: rows[rows.length - 1],
        read_count: rows.length,
        skipped_row_count: skippedRows.length,
        skipped_rows: skippedRows,
        field_validation_count: fieldValidation.length,
        writable_field_count: writable,
        skipped_field_count: skippedFields
      },
      field_validation: fieldValidation
    };
  }

  function buildProgress_(action, rawResult) {
    if (rawResult.empty) return [];
    return action === 'SYNC' ? buildWriteProgress_(rawResult) : buildValidationProgress_(rawResult, action);
  }

  function buildWriteProgress_(writeResult) {
    const rows = {};
    (writeResult.synced || []).forEach(function(item) {
      rows[item.source_row] = baseProgress_(item.source_row, item.file_id, item.page_url, 'synced', 'Write verified against Notion page.');
      rows[item.source_row].stages = { image: 'synced', notion: 'synced', validation: 'synced', write: 'synced', verify: 'synced' };
      rows[item.source_row].complete_fields = FIELD_COUNT;
    });
    (writeResult.field_skips || []).forEach(function(skip) {
      const row = rows[skip.source_row] || baseProgress_(skip.source_row, skip.file_id, '', 'partial', 'Synced with skipped fields.');
      row.status = 'partial';
      row.color = 'purple';
      row.label = STATUS_LABEL.partial;
      row.missing_fields.push(skip.field_name || 'Unknown field');
      row.validation_notes.push(skip.reason || 'Field skipped during write.');
      rows[skip.source_row] = row;
    });
    (writeResult.skipped || []).forEach(function(item) {
      const row = baseProgress_(item.source_row, item.file_id, '', 'failed', item.reason || 'Row skipped before write.');
      row.duplicate_page_urls = item.duplicate_page_urls || [];
      row.validation_notes.push(item.reason || 'Row skipped before write.');
      if (row.duplicate_page_urls.length) {
        row.validation_notes.push('Duplicate Notion pages found for file_id: ' + row.duplicate_page_urls.join(', '));
      }
      row.stages = { image: 'failed', notion: 'waiting', validation: 'failed', write: 'blocked', verify: 'blocked' };
      rows[item.source_row] = row;
    });
    return finalizeProgress_(rows);
  }

  function buildValidationProgress_(validationResult, action) {
    const rows = {};
    ((validationResult.summary || {}).skipped_rows || []).forEach(function(item) {
      rows[item.source_row] = baseProgress_(item.source_row, item.file_id, '', 'failed', item.reason || 'Row failed validation.');
      rows[item.source_row].stages = { image: 'failed', notion: 'waiting', validation: 'failed', write: 'blocked', verify: 'blocked' };
    });

    (validationResult.field_validation || []).forEach(function(field) {
      if (!rows[field.source_row]) {
        rows[field.source_row] = baseProgress_(field.source_row, field.file_id, field.notion_page_url, 'waiting', 'Ready to sync.');
      }
      const row = rows[field.source_row];
      row.notion_page_url = row.notion_page_url || field.notion_page_url || '';
      row.has_notion_page = row.has_notion_page || Boolean(field.notion_page_id);
      row.total_fields += 1;
      row.field_results.push({
        field: field.field_name,
        ok: !field.skipped,
        changed: String(field.old_value || '') !== String(field.proposed_value || ''),
        reason: field.reason || '',
        old_value: field.old_value || '',
        proposed_value: field.proposed_value || ''
      });
      if (field.skipped) {
        row.missing_fields.push(field.field_name);
        row.validation_notes.push(field.field_name + ': ' + (field.reason || 'skipped'));
      } else {
        row.complete_fields += 1;
        if (String(field.old_value || '') !== String(field.proposed_value || '')) {
          row.changed_fields.push(field.field_name);
        }
      }
    });

    Object.keys(rows).forEach(function(rowNumber) {
      const row = rows[rowNumber];
      if (row.status === 'failed') return;
      if (!row.has_notion_page) {
        row.status = 'waiting';
        row.color = 'yellow';
        row.label = STATUS_LABEL.waiting;
        row.next_action = 'Sync this image to create its Notion page.';
        row.stages = { image: 'waiting', notion: 'missing', validation: 'synced', write: 'waiting', verify: 'waiting' };
        return;
      }
      if (row.missing_fields.length || row.changed_fields.length) {
        row.status = 'partial';
        row.color = 'purple';
        row.label = STATUS_LABEL.partial;
        row.next_action = action === 'VERIFY' ? 'Resync missing or changed fields.' : 'Review skipped fields, then sync.';
        row.stages = { image: 'partial', notion: 'synced', validation: row.missing_fields.length ? 'partial' : 'synced', write: 'waiting', verify: row.changed_fields.length ? 'partial' : 'synced' };
        return;
      }
      row.status = 'synced';
      row.color = 'green';
      row.label = STATUS_LABEL.synced;
      row.detail = 'All expected fields match the Notion page.';
      row.next_action = 'No action needed.';
      row.stages = { image: 'synced', notion: 'synced', validation: 'synced', write: 'synced', verify: 'synced' };
    });

    return finalizeProgress_(rows);
  }

  function baseProgress_(sourceRow, fileId, notionPageUrl, status, detail) {
    return {
      source_row: Number(sourceRow),
      file_id: fileId || '',
      notion_page_url: notionPageUrl || '',
      duplicate_page_urls: [],
      status: status,
      color: statusColorName_(status),
      label: STATUS_LABEL[status] || status,
      detail: detail || '',
      next_action: '',
      complete_fields: 0,
      total_fields: 0,
      sync_percent: 0,
      missing_fields: [],
      changed_fields: [],
      validation_notes: [],
      field_results: [],
      has_notion_page: Boolean(notionPageUrl),
      stages: { image: status, notion: 'waiting', validation: 'waiting', write: 'waiting', verify: 'waiting' }
    };
  }

  function finalizeProgress_(rows) {
    return Object.keys(rows).map(function(rowNumber) {
      const row = rows[rowNumber];
      const denominator = row.total_fields || FIELD_COUNT;
      row.sync_percent = denominator ? Math.round((row.complete_fields / denominator) * 100) : 0;
      if (row.status === 'synced') row.sync_percent = 100;
      if (!row.next_action) row.next_action = nextActionForRow_(row);
      row.missing_fields = unique_(row.missing_fields).filter(Boolean);
      row.changed_fields = unique_(row.changed_fields).filter(Boolean);
      row.validation_notes = unique_(row.validation_notes).filter(Boolean);
      return row;
    }).sort(function(a, b) { return a.source_row - b.source_row; });
  }

  function writeProgressToSheet_(progress, action) {
    if (!progress.length) return;
    const sheetInfo = getWritableSheet_();
    const columnMap = ensureStatusColumns_(sheetInfo.sheet);
    const now = new Date();
    progress.forEach(function(row) {
      const values = {
        'Sync Status': row.label,
        'Sync %': row.sync_percent + '%',
        'Last Sync': action === 'SYNC' ? now : '',
        'Last Verified': action === 'VERIFY' || action === 'DRY_RUN' ? now : '',
        'Notion Page': row.notion_page_url || (row.duplicate_page_urls || []).join('\n'),
        'Missing Fields': row.missing_fields.join(', '),
        'Validation Notes': row.validation_notes.join(' | ') || row.detail || row.next_action
      };
      STATUS_COLUMNS.forEach(function(header) {
        if (values[header] === '') return;
        sheetInfo.sheet.getRange(row.source_row, columnMap[header]).setValue(values[header]);
      });
      const statusRange = sheetInfo.sheet.getRange(row.source_row, columnMap['Sync Status']);
      statusRange.setBackground(STATUS_COLOR[row.status] || STATUS_COLOR.never_attempted);
    });
    applyStatusFormatting_(sheetInfo.sheet, columnMap['Sync Status']);
  }

  function writeRowsAsSyncing_(scope) {
    const rows = selectRows_(scope);
    if (!rows.length) return;
    const sheetInfo = getWritableSheet_();
    const columnMap = ensureStatusColumns_(sheetInfo.sheet);
    rows.forEach(function(rowNumber) {
      sheetInfo.sheet.getRange(rowNumber, columnMap['Sync Status']).setValue(STATUS_LABEL.syncing).setBackground(STATUS_COLOR.syncing);
      sheetInfo.sheet.getRange(rowNumber, columnMap['Validation Notes']).setValue('Sync manager is processing this row.');
    });
  }

  function markScopeFailed_(scope, message) {
    try {
      const rows = selectRows_(scope);
      if (!rows.length) return;
      const sheetInfo = getWritableSheet_();
      const columnMap = ensureStatusColumns_(sheetInfo.sheet);
      rows.forEach(function(rowNumber) {
        sheetInfo.sheet.getRange(rowNumber, columnMap['Sync Status']).setValue(STATUS_LABEL.failed).setBackground(STATUS_COLOR.failed);
        sheetInfo.sheet.getRange(rowNumber, columnMap['Validation Notes']).setValue(message);
      });
    } catch (ignored) {}
  }

  function ensureStatusColumns_(sheet) {
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const columnMap = {};
    headers.forEach(function(header, index) {
      const label = String(header || '').trim();
      if (label) columnMap[label] = index + 1;
    });
    let nextColumn = lastColumn + 1;
    STATUS_COLUMNS.forEach(function(header) {
      if (!columnMap[header]) {
        sheet.getRange(1, nextColumn).setValue(header).setFontWeight('bold').setBackground('#e8f0fe');
        columnMap[header] = nextColumn;
        nextColumn += 1;
      }
    });
    return columnMap;
  }

  function applyStatusFormatting_(sheet, statusColumn) {
    const lastRow = Math.max(sheet.getMaxRows(), 2);
    const range = sheet.getRange(2, statusColumn, lastRow - 1, 1);
    const existing = sheet.getConditionalFormatRules().filter(function(rule) {
      const ranges = rule.getRanges();
      return !ranges.some(function(ruleRange) {
        return ruleRange.getColumn() === statusColumn && ruleRange.getSheet().getSheetId() === sheet.getSheetId();
      });
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
        .whenTextEqualTo(item[0])
        .setBackground(item[1])
        .setRanges([range])
        .build();
    });
    sheet.setConditionalFormatRules(existing.concat(rules));
  }

  function selectRows_(scope) {
    const panel = getVisualAssetLibrarySyncPanel();
    if (scope === 'current_batch') return rangeRows_(panel.batch_start_row, panel.batch_end_row);
    if (scope === 'selected_rows') return getSelectedRows_();
    const sheetState = readSheetState_();
    if (scope === 'entire_library') return sheetState.rows.map(function(row) { return row.rowNumber; });
    const labels = {
      failed: [STATUS_LABEL.failed],
      partial: [STATUS_LABEL.partial],
      missing: [STATUS_LABEL.waiting, STATUS_LABEL.never_attempted]
    }[scope] || [];
    return sheetState.rows.filter(function(row) {
      return labels.indexOf(row.syncStatus) !== -1;
    }).map(function(row) { return row.rowNumber; });
  }

  function readSheetState_() {
    const config = getRuntimeConfig();
    const readResult = SheetReadService.readSpreadsheetRowsById(
      config.sourceLibrarySpreadsheetId || config.dashboardSpreadsheetId,
      config.sourceLibrarySheetName,
      2,
      Number(PropertiesService.getScriptProperties().getProperty('DM_NOTION_SYNC_MAX_END_ROW') || 454)
    );
    const rows = (readResult.records || []).filter(function(record) {
      return record.file_id || record.drive_url || record.file_name;
    }).map(function(record) {
      return {
        rowNumber: record.rowNumber,
        fileId: record.file_id || '',
        driveUrl: record.drive_url || '',
        fileName: record.file_name || '',
        notionPage: record.notion_page || record.notion_page_url || '',
        syncStatus: record.sync_status || STATUS_LABEL.never_attempted,
        syncPercent: parsePercent_(record.sync || record.sync_percent),
        missingFields: record.missing_fields || '',
        validationNotes: record.validation_notes || ''
      };
    });
    return { rows: rows, warnings: readResult.warnings || [] };
  }

  function buildDashboardSummary_(sheetState) {
    const counts = { green: 0, purple: 0, red: 0, yellow: 0, gray: 0, blue: 0 };
    sheetState.rows.forEach(function(row) {
      const key = colorForLabel_(row.syncStatus);
      counts[key] = (counts[key] || 0) + 1;
    });
    const synced = counts.green;
    const total = sheetState.rows.length;
    return {
      total_images: total,
      synced_images: synced,
      sync_percent: total ? Math.round((synced / total) * 100) : 0,
      counts: counts
    };
  }

  function buildHealthReport_(sheetState) {
    const fileCounts = {};
    const duplicateFileIds = [];
    sheetState.rows.forEach(function(row) {
      if (!row.fileId) return;
      fileCounts[row.fileId] = (fileCounts[row.fileId] || 0) + 1;
    });
    Object.keys(fileCounts).forEach(function(fileId) {
      if (fileCounts[fileId] > 1) duplicateFileIds.push(fileId);
    });
    return {
      total_sheet_images: sheetState.rows.length,
      duplicate_file_id_count: duplicateFileIds.length,
      duplicate_file_ids: duplicateFileIds.slice(0, 25),
      missing_notion_page_count: sheetState.rows.filter(function(row) { return row.syncStatus === STATUS_LABEL.waiting || row.syncStatus === STATUS_LABEL.never_attempted; }).length,
      failed_count: sheetState.rows.filter(function(row) { return row.syncStatus === STATUS_LABEL.failed; }).length,
      partial_count: sheetState.rows.filter(function(row) { return row.syncStatus === STATUS_LABEL.partial; }).length,
      schema_mismatch_count: sheetState.rows.filter(function(row) { return String(row.validationNotes || '').indexOf('Notion property is missing') !== -1; }).length,
      next_safe_fix: 'Run Dry Run on the current batch, then sync only rows marked Waiting or Partially synced.'
    };
  }

  function getWritableSheet_() {
    const config = getRuntimeConfig();
    const targetSheetName = config.sourceLibrarySheetName;
    const targetSpreadsheetId = config.sourceLibrarySpreadsheetId || config.dashboardSpreadsheetId;
    const active = SpreadsheetApp.getActiveSpreadsheet();
    let spreadsheet = active;
    if (targetSpreadsheetId && (!active || active.getId() !== targetSpreadsheetId)) {
      spreadsheet = SpreadsheetApp.openById(targetSpreadsheetId);
    }
    if (!spreadsheet) throw new Error('Blocked: no writable spreadsheet is available.');
    const sheet = spreadsheet.getSheetByName(targetSheetName);
    if (!sheet) throw new Error('Blocked: source library sheet not found: ' + targetSheetName);
    return { spreadsheet: spreadsheet, sheet: sheet };
  }

  function getSelectedRows_() {
    const sheetInfo = getWritableSheet_();
    const activeRange = sheetInfo.sheet.getActiveRange();
    if (!activeRange) throw new Error('No selected rows found. Select one or more source rows first.');
    const start = Math.max(2, activeRange.getRow());
    const end = activeRange.getLastRow();
    return rangeRows_(start, end);
  }

  function moveBatch_(direction) {
    const props = PropertiesService.getScriptProperties();
    const panel = getVisualAssetLibrarySyncPanel();
    const batchSize = Number(panel.batch_size || 25);
    const startRow = Number(panel.start_row || 2);
    const endRow = Number(panel.end_row || panel.max_end_row || 454);
    const current = Number(panel.cursor_row || startRow);
    const next = direction > 0
      ? Math.min(endRow, Number(panel.next_cursor_row || current))
      : Math.max(startRow, current - batchSize);
    props.setProperty('DM_NOTION_SYNC_CURSOR_ROW', String(next));
    return { ok: true, action: direction > 0 ? 'NEXT' : 'PREVIOUS', manager: getDashboard() };
  }

  function setPaused_(paused) {
    PropertiesService.getScriptProperties().setProperty('DM_VISUAL_SYNC_PAUSED', paused ? 'YES' : 'NO');
    return { ok: true, action: paused ? 'PAUSE' : 'RESUME', manager: getDashboard() };
  }

  function isPaused_() {
    return PropertiesService.getScriptProperties().getProperty('DM_VISUAL_SYNC_PAUSED') === 'YES';
  }

  function summarizeProgress_(progress) {
    const counts = { synced: 0, partial: 0, waiting: 0, failed: 0, never_attempted: 0, syncing: 0 };
    progress.forEach(function(row) { counts[row.status] = (counts[row.status] || 0) + 1; });
    return { total: progress.length, counts: counts, next_action: getNextActionForProgress_(progress) };
  }

  function getNextActionForProgress_(progress) {
    if (progress.some(function(row) { return row.status === 'failed'; })) return 'Fix or retry failed rows.';
    if (progress.some(function(row) { return row.status === 'partial'; })) return 'Review partial rows, then resync missing fields.';
    if (progress.some(function(row) { return row.status === 'waiting'; })) return 'Sync waiting rows.';
    return 'Move to the next batch.';
  }

  function getNextAction_(panel, sheetState, health) {
    if (isPaused_()) return 'Resume sync manager.';
    if (!panel.ready) return 'Resolve blocked configuration or approval checks.';
    if (health.failed_count) return 'Run Sync Failed or inspect failed rows.';
    if (health.partial_count) return 'Run Sync Partial or verify partial rows.';
    if (panel.next_cursor_row) return 'Run Dry Run for the current batch, then Sync or Next 25.';
    return 'All configured batches are complete. Run Health Dashboard for drift checks.';
  }

  function nextActionForRow_(row) {
    if (row.status === 'failed') return 'Fix validation notes, then retry this row.';
    if (row.status === 'partial') return 'Resync missing or changed fields only.';
    if (row.status === 'waiting') return 'Sync this image next.';
    if (row.status === 'synced') return 'No action needed.';
    return 'Run Dry Run to classify this image.';
  }

  function normalizeAction_(action) {
    const value = String(action || 'DRY_RUN').toUpperCase().trim().replace(/[^A-Z0-9]+/g, '_');
    const aliases = { DRY: 'DRY_RUN', WRITE: 'SYNC', STAGING_WRITE: 'SYNC', VERIFY_SELECTED: 'VERIFY' };
    return aliases[value] || value;
  }

  function normalizeScope_(scope) {
    const value = String(scope || 'current_batch').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
    const allowed = ['current_batch', 'selected_rows', 'failed', 'partial', 'missing', 'entire_library'];
    return allowed.indexOf(value) !== -1 ? value : 'current_batch';
  }

  function rangeRows_(startRow, endRow) {
    const rows = [];
    for (let row = Number(startRow); row <= Number(endRow); row += 1) rows.push(row);
    return rows.filter(function(row) { return row >= 2; });
  }

  function snapshotProperties_(props, keys) {
    const snapshot = {};
    keys.forEach(function(key) { snapshot[key] = props.getProperty(key); });
    return snapshot;
  }

  function restoreProperties_(props, snapshot) {
    Object.keys(snapshot).forEach(function(key) {
      if (snapshot[key] === null || snapshot[key] === undefined) props.deleteProperty(key);
      else props.setProperty(key, snapshot[key]);
    });
  }

  function parsePercent_(value) {
    const number = Number(String(value || '').replace('%', '').trim());
    return Number.isFinite(number) ? number : 0;
  }

  function statusColorName_(status) {
    if (status === 'synced') return 'green';
    if (status === 'partial') return 'purple';
    if (status === 'waiting') return 'yellow';
    if (status === 'failed') return 'red';
    if (status === 'syncing') return 'blue';
    return 'gray';
  }

  function colorForLabel_(label) {
    if (label === STATUS_LABEL.synced) return 'green';
    if (label === STATUS_LABEL.partial) return 'purple';
    if (label === STATUS_LABEL.failed) return 'red';
    if (label === STATUS_LABEL.waiting) return 'yellow';
    if (label === STATUS_LABEL.syncing) return 'blue';
    return 'gray';
  }

  function unique_(values) {
    return Array.from(new Set(values));
  }

  return {
    getDashboard: getDashboard,
    run: run
  };
})();

function getVisualAssetLibrarySyncManager() {
  return VisualAssetLibrarySyncManagerService.getDashboard();
}

function runVisualAssetLibrarySyncManager(action, scope) {
  return VisualAssetLibrarySyncManagerService.run(action, scope);
}

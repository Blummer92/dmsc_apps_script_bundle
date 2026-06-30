var VisualAssetLibraryDryRunProofService = (function() {
  const PROOF_PROPERTY = 'DM_VISUAL_ASSET_LIBRARY_LAST_DRY_RUN_PROOF';
  const VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID = 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd';
  const REQUIRED_CANONICAL_FIELDS = [
    'asset_title',
    'asset_type',
    'keywords',
    'ai_prompt',
    'alt_text',
    'accessibility_notes',
    'instructional_purpose',
    'style_family',
    'file_id',
    'drive_link',
    'prompt_source'
  ];

  function save(validationResult, schema, context, batch) {
    const summary = validationResult && validationResult.summary ? validationResult.summary : {};
    const rowProgress = validationResult && validationResult.row_progress ? validationResult.row_progress : [];
    const fieldValidation = validationResult && validationResult.field_validation ? validationResult.field_validation : [];
    const requiredFailures = collectRequiredFailures_(rowProgress, fieldValidation);
    const proof = {
      saved_at: new Date().toISOString(),
      mode: 'DRY_RUN',
      source_sheet_id: context.spreadsheetId,
      sheet_name: context.sheetName,
      target_data_source_id: context.dataSourceId,
      sync_scope: context.syncScope,
      cursor_row: Number(context.cursorRow),
      batch_start_row: Number(batch.startRow || summary.batch_start_row),
      batch_end_row: Number(batch.endRow || summary.batch_end_row),
      batch_size: Number(context.batchSize),
      next_cursor_row: batch.nextCursorRow === undefined ? summary.next_cursor_row : batch.nextCursorRow,
      schema_checksum: schemaChecksum(schema),
      required_failure_count: requiredFailures.length,
      required_failures: requiredFailures.slice(0, 100),
      acceptable: requiredFailures.length === 0
    };
    PropertiesService.getScriptProperties().setProperty(PROOF_PROPERTY, JSON.stringify(proof));
    return proof;
  }

  function assertMatches(context, batch, schema) {
    const proof = getProof();
    if (!proof) throw new Error('Blocked: no saved Visual Asset Library dry-run proof exists for this batch. Run dryRunVisualAssetLibraryFieldValidationOnly() first.');
    const expectedChecksum = schemaChecksum(schema);
    const mismatches = [];
    if (proof.mode !== 'DRY_RUN') mismatches.push('proof mode is not DRY_RUN');
    if (proof.source_sheet_id !== context.spreadsheetId) mismatches.push('source spreadsheet changed');
    if (proof.sheet_name !== context.sheetName) mismatches.push('source sheet changed');
    if (proof.target_data_source_id !== context.dataSourceId) mismatches.push('target data source changed');
    if (proof.target_data_source_id !== VISUAL_ASSET_LIBRARY_DATA_SOURCE_ID) mismatches.push('proof is not for Visual Asset Library');
    if (proof.sync_scope !== context.syncScope) mismatches.push('sync scope changed');
    if (Number(proof.cursor_row) !== Number(context.cursorRow)) mismatches.push('cursor row changed');
    if (Number(proof.batch_start_row) !== Number(batch.startRow)) mismatches.push('batch start row changed');
    if (Number(proof.batch_end_row) !== Number(batch.endRow)) mismatches.push('batch end row changed');
    if (Number(proof.batch_size) !== Number(context.batchSize)) mismatches.push('batch size changed');
    if (proof.schema_checksum !== expectedChecksum) mismatches.push('Notion schema changed since dry run');
    if (!proof.acceptable || Number(proof.required_failure_count || 0) > 0) mismatches.push('dry run has required-field failures');
    if (mismatches.length) throw new Error('Blocked: saved dry-run proof does not match this write: ' + mismatches.join('; ') + '. Proof: ' + JSON.stringify(proof));
    return proof;
  }

  function advanceCursorAfterPassedDryRun() {
    const props = PropertiesService.getScriptProperties();
    const proof = getProof();
    if (!proof) throw new Error('Blocked: no saved Visual Asset Library dry-run proof exists. Run dryRunVisualAssetLibraryFieldValidationOnly() first.');
    const context = getCurrentContext_();
    const batchEnd = Math.min(Number(context.endRow), Number(context.cursorRow) + Number(context.batchSize) - 1);
    const currentBatch = { startRow: Number(context.cursorRow), endRow: batchEnd, nextCursorRow: batchEnd < Number(context.endRow) ? batchEnd + 1 : null };
    assertProofMatchesCursor_(proof, context, currentBatch);
    if (!proof.next_cursor_row) throw new Error('Blocked: dry-run proof is for the final batch; there is no next cursor row.');
    props.setProperty('DM_NOTION_SYNC_CURSOR_ROW', String(proof.next_cursor_row));
    return { ok: true, previous_cursor_row: proof.cursor_row, next_cursor_row: proof.next_cursor_row, batch_start_row: proof.batch_start_row, batch_end_row: proof.batch_end_row };
  }

  function assertProofMatchesCursor_(proof, context, batch) {
    const mismatches = [];
    if (proof.source_sheet_id !== context.spreadsheetId) mismatches.push('source spreadsheet changed');
    if (proof.sheet_name !== context.sheetName) mismatches.push('source sheet changed');
    if (proof.target_data_source_id !== context.dataSourceId) mismatches.push('target data source changed');
    if (Number(proof.cursor_row) !== Number(context.cursorRow)) mismatches.push('cursor row changed');
    if (Number(proof.batch_start_row) !== Number(batch.startRow)) mismatches.push('batch start row changed');
    if (Number(proof.batch_end_row) !== Number(batch.endRow)) mismatches.push('batch end row changed');
    if (!proof.acceptable || Number(proof.required_failure_count || 0) > 0) mismatches.push('dry run has required-field failures');
    if (mismatches.length) throw new Error('Blocked: cursor cannot advance from a stale or failed dry run: ' + mismatches.join('; '));
  }

  function getProof() {
    const raw = PropertiesService.getScriptProperties().getProperty(PROOF_PROPERTY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error('Blocked: saved Visual Asset Library dry-run proof is invalid JSON. Clear ' + PROOF_PROPERTY + ' and run dry-run again.');
    }
  }

  function collectRequiredFailures_(rowProgress, fieldValidation) {
    const failures = [];
    (rowProgress || []).forEach(function(item) {
      if (item.status === 'synced' || item.status === 'waiting') return;
      (item.validation_notes || []).forEach(function(note) {
        if (isBlockingReason_(note)) failures.push({ source_row: item.source_row, file_id: item.file_id || '', field: '', canonical: '', reason: note });
      });
      (item.field_results || []).forEach(function(field) {
        if (!field.ok && REQUIRED_CANONICAL_FIELDS.indexOf(field.canonical) !== -1 && isBlockingReason_(field.reason)) {
          failures.push({ source_row: item.source_row, file_id: item.file_id || '', field: field.field, canonical: field.canonical, reason: field.reason || item.detail || 'Required field did not verify.' });
        }
      });
      if (item.status === 'failed' && !(item.validation_notes || []).length && !(item.field_results || []).length) {
        failures.push({ source_row: item.source_row, file_id: item.file_id || '', field: '', canonical: '', reason: item.detail || 'Row failed dry-run validation.' });
      }
    });
    (fieldValidation || []).forEach(function(row) {
      const canonical = canonicalForField_(row.field_name);
      if (row.skipped && REQUIRED_CANONICAL_FIELDS.indexOf(canonical) !== -1) {
        failures.push({ source_row: row.source_row, file_id: row.file_id || '', field: row.field_name, canonical: canonical, reason: row.reason || 'Required field skipped.' });
      }
    });
    return uniqueFailures_(failures);
  }

  function isBlockingReason_(reason) {
    const text = String(reason || '').toLowerCase();
    if (!text) return false;
    return text.indexOf('missing notion property alias') !== -1 ||
      text.indexOf('notion property is missing') !== -1 ||
      text.indexOf('no approved notion asset type mapping') !== -1 ||
      text.indexOf('asset type source value is blank') !== -1 ||
      text.indexOf('keyword') !== -1 ||
      text.indexOf('source value is outside approved options') !== -1 ||
      text.indexOf('source value is outside approved/schema options') !== -1;
  }

  function canonicalForField_(fieldName) {
    const normalized = normalize_(fieldName);
    const map = {
      asset_title: 'asset_title',
      title: 'asset_title',
      asset_type: 'asset_type',
      keywords: 'keywords',
      ai_prompt: 'ai_prompt',
      prompt: 'ai_prompt',
      alt_text: 'alt_text',
      accessibility_notes: 'accessibility_notes',
      instructional_purpose: 'instructional_purpose',
      style_family: 'style_family',
      file_id: 'file_id',
      source_file_link_in_google_drive: 'drive_link',
      drive_link: 'drive_link',
      prompt_source: 'prompt_source'
    };
    return map[normalized] || normalized;
  }

  function schemaChecksum(schema) {
    const serialized = Object.keys(schema || {}).sort().map(function(name) {
      const property = schema[name] || {};
      const type = property.type || '';
      const options = property[type] && property[type].options ? property[type].options.map(function(option) { return option.name; }).sort().join(',') : '';
      return name + ':' + type + ':' + options;
    }).join('|');
    if (typeof Utilities !== 'undefined' && Utilities.computeDigest) {
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, serialized, Utilities.Charset.UTF_8);
      return Utilities.base64EncodeWebSafe(digest).slice(0, 43);
    }
    return String(serialized.length) + ':' + serialized.slice(0, 120);
  }

  function getCurrentContext_() {
    const props = PropertiesService.getScriptProperties();
    const startRow = Number(props.getProperty('DM_NOTION_SYNC_START_ROW') || 2);
    return {
      spreadsheetId: props.getProperty('DM_SOURCE_LIBRARY_SPREADSHEET_ID'),
      sheetName: props.getProperty('DM_SOURCE_LIBRARY_SHEET_NAME'),
      dataSourceId: props.getProperty('DM_NOTION_STAGING_DATA_SOURCE_ID'),
      syncScope: props.getProperty('DM_NOTION_SYNC_SCOPE') || '',
      startRow: startRow,
      endRow: Number(props.getProperty('DM_NOTION_SYNC_END_ROW') || 11),
      cursorRow: Number(props.getProperty('DM_NOTION_SYNC_CURSOR_ROW') || startRow),
      batchSize: Number(props.getProperty('DM_NOTION_SYNC_BATCH_SIZE') || 25)
    };
  }

  function uniqueFailures_(failures) {
    const seen = {};
    return failures.filter(function(item) {
      const key = [item.source_row, item.file_id, item.field, item.canonical, item.reason].join('|');
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function normalize_(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  return {
    PROOF_PROPERTY: PROOF_PROPERTY,
    save: save,
    assertMatches: assertMatches,
    getProof: getProof,
    schemaChecksum: schemaChecksum,
    advanceCursorAfterPassedDryRun: advanceCursorAfterPassedDryRun
  };
})();

function advanceCursorAfterPassedDryRun() {
  return VisualAssetLibraryDryRunProofService.advanceCursorAfterPassedDryRun();
}

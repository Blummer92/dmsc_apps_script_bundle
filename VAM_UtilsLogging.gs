function vamExtractDriveFileId_(value) {
  const text = vamClean_(value);
  if (!text || text === 'Pending' || text === 'Not Applicable') return '';
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{20,})$/
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match && match[1]) return match[1];
  }
  return '';
}

function vamSuggestCanonicalFilename_(value) {
  return vamClean_(value)
    .replace(/\s+/g, '_')
    .replace(/[^\w.\-()]+/g, '')
    .replace(/_+/g, '_');
}

function vamBuildHeaderMap_(headers) {
  vamAssertNoDuplicateHeaders_(headers);
  return headers.reduce(function(map, header, index) {
    if (header) map[header] = index;
    return map;
  }, {});
}

function vamAssertNoDuplicateHeaders_(headers) {
  const seen = {};
  const duplicates = [];
  headers.forEach(function(header) {
    const key = vamCompare_(header);
    if (!key) return;
    if (seen[key]) {
      duplicates.push(header);
      return;
    }
    seen[key] = true;
  });
  if (duplicates.length) {
    throw new Error('Duplicate header(s) found in asset sheet: ' + vamUniqueValues_(duplicates).join(', ') + '. Resolve duplicate columns before validation.');
  }
}

function vamRowToObject_(headers, row) {
  return headers.reduce(function(values, header, index) {
    if (header) values[header] = row[index];
    return values;
  }, {});
}

function vamHasHeader_(headerMap, fieldName) {
  return Object.prototype.hasOwnProperty.call(headerMap, fieldName);
}

function vamIssue_(record, severity, category, fieldName, message, suggestion, stage) {
  return {
    rowNumber: record ? record.rowNumber : '',
    assetId: record ? vamClean_(record.values[VAM_GOV_CONFIG.fields.assetId]) : '',
    severity: severity,
    category: category,
    fieldName: fieldName || '',
    message: message,
    suggestion: suggestion || '',
    stage: stage || ''
  };
}

function vamClean_(value) {
  return String(value == null ? '' : value).trim();
}

function vamCompare_(value) {
  return vamClean_(value).toLowerCase();
}

function vamSplitControlledValues_(value) {
  return String(value || '')
    .split(';')
    .map(function(item) { return item.trim(); })
    .filter(Boolean);
}

function vamIsMultiSelectControlledField_(fieldName) {
  return VAM_GOV_CONFIG.multiSelectControlledFields.some(function(candidate) {
    return vamCompare_(candidate) === vamCompare_(fieldName);
  });
}

function vamUniqueValues_(values) {
  const seen = {};
  return values.filter(function(value) {
    const key = vamCompare_(value);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function vamStartRun_() {
  VAM_GOV_ACTIVE_RUN_ID = vamCreateRunId_();
  return VAM_GOV_ACTIVE_RUN_ID;
}

function vamEnsureRunId_() {
  if (!VAM_GOV_ACTIVE_RUN_ID) {
    vamStartRun_();
  }
  return VAM_GOV_ACTIVE_RUN_ID;
}

function vamCreateRunId_() {
  const timestamp = Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyyMMdd-HHmmss');
  const uuid = Utilities.getUuid ? Utilities.getUuid() : String(Math.floor(Math.random() * 100000000));
  return timestamp + '-' + String(uuid).slice(0, 8);
}

function vamLog_(eventName, details) {
  if (VAM_GOV_CONFIG.executionLog && VAM_GOV_CONFIG.executionLog.enabled === false) return;
  const safeDetails = Object.assign({}, details || {});
  if (!safeDetails.runId) {
    safeDetails.runId = vamEnsureRunId_();
  }
  const payload = {
    event: eventName,
    timestamp: Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    details: safeDetails
  };
  const message = '[VAM_GOV] ' + JSON.stringify(payload);
  Logger.log(message);
}

function vamLogEngineerPromptForFixes_() {
  if (!VAM_GOV_CONFIG.executionLog || !VAM_GOV_CONFIG.executionLog.includeEngineerPrompt) return;
  const prompt = VAM_GOV_CONFIG.executionLog.engineerPrompt || '';
  const lines = prompt.split('\n');
  vamLog_('ENGINEER_FIX_PROMPT_START', {
    lineCount: lines.length
  });
  lines.forEach(function(line, index) {
    vamLog_('ENGINEER_FIX_PROMPT_LINE', {
      lineNumber: index + 1,
      text: line
    });
  });
  vamLog_('ENGINEER_FIX_PROMPT_END', {});
}

function getVisualAssetGovernanceEngineerPrompt() {
  return VAM_GOV_CONFIG.executionLog.engineerPrompt;
}

function vamSheetLog_(message) {
  const prefixedMessage = '[VAM_GOV_SHEET] ' + message;
  Logger.log(prefixedMessage);
}

function vamVisibleLog_(message) {
  const prefixedMessage = '[VAM_GOV_VISIBLE] ' + message + ' at ' +
    Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z');
  Logger.log(prefixedMessage);
}

function logBug(projectId, summary, options) {
  return logProjectEvent_(Object.assign({}, options || {}, {
    project_id: projectId,
    log_type: APP_CONFIG.LOG_TYPES.BUG,
    severity: (options && options.severity) || 'medium',
    summary,
    status: (options && options.status) || 'open',
  }));
}

function logDecision(projectId, summary, options) {
  return logProjectEvent_(Object.assign({}, options || {}, {
    project_id: projectId,
    log_type: APP_CONFIG.LOG_TYPES.DECISION,
    severity: (options && options.severity) || 'info',
    summary,
    status: (options && options.status) || 'recorded',
  }));
}

function logPerformance(projectId, actionName, durationMs, options) {
  return logProjectEvent_(Object.assign({}, options || {}, {
    project_id: projectId,
    log_type: APP_CONFIG.LOG_TYPES.PERFORMANCE,
    severity: durationMs > 2000 ? 'warning' : 'info',
    summary: `${actionName} completed in ${durationMs}ms`,
    action_name: actionName,
    duration_ms: durationMs,
    status: (options && options.status) || 'success',
  }));
}

function logProjectEvent_(entry) {
  const cleanEntry = validateLogInput_(entry);
  const spreadsheet = getDashboardSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(APP_CONFIG.SHEETS.PROJECT_LOGS);
  const headers = DASHBOARD_SCHEMA.PROJECT_LOGS;

  const row = rowFromObject_(headers, Object.assign({}, cleanEntry, {
    log_id: cleanEntry.log_id || makeId_('log'),
    created_at: cleanEntry.created_at || nowIso_(),
    created_by_agent: cleanEntry.created_by_agent || 'Google Apps Script Builder Agent',
  }));

  appendRows_(sheet, [row]);
  return { log_id: row[0], status: 'logged' };
}

function logChange(change) {
  const spreadsheet = getDashboardSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(APP_CONFIG.SHEETS.CHANGE_LOG);
  const headers = DASHBOARD_SCHEMA.CHANGE_LOG;

  const row = rowFromObject_(headers, Object.assign({}, change, {
    change_id: change.change_id || makeId_('change'),
    created_at: change.created_at || nowIso_(),
  }));

  appendRows_(sheet, [row]);
  return { change_id: row[0], status: 'logged' };
}

function createHandoffRecord(handoff) {
  if (!handoff || !handoff.project_id || !handoff.target_agent || !handoff.question_for_owner) {
    throw new Error('Handoff requires project_id, target_agent, and question_for_owner.');
  }

  const spreadsheet = getDashboardSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(APP_CONFIG.SHEETS.HANDOFF_RECORDS);
  const headers = DASHBOARD_SCHEMA.HANDOFF_RECORDS;

  const row = rowFromObject_(headers, Object.assign({}, handoff, {
    handoff_id: handoff.handoff_id || makeId_('handoff'),
    requesting_agent: handoff.requesting_agent || 'Google Apps Script Builder Agent',
    blocked_until_review: handoff.blocked_until_review === false ? false : true,
    handoff_status: handoff.handoff_status || 'blocked_pending_review',
    created_at: handoff.created_at || nowIso_(),
    resolved_at: handoff.resolved_at || '',
  }));

  appendRows_(sheet, [row]);
  return { handoff_id: row[0], status: 'created' };
}

function createProject(project) {
  const data = project || {};
  validateProjectPayload(data);

  const now = nowIso();
  const record = {
    project_id: data.project_id || makeId('PROJ'),
    project_name: data.project_name,
    agent_owner: data.agent_owner,
    workspace_target: data.workspace_target || '',
    output_type: data.output_type || 'apps_script_dashboard',
    generated_artifact: data.generated_artifact || '',
    last_synced_at: data.last_synced_at || '',
    build_status: data.build_status || 'draft',
    deployment_status: data.deployment_status || 'not_deployed',
    project_risk_level: data.project_risk_level || 'low',
    source_document_relation: data.source_document_relation || '',
    unit_id_lookup: data.unit_id_lookup || '',
    lesson_id_lookup: data.lesson_id_lookup || '',
    packet_id_lookup: data.packet_id_lookup || '',
    curriculum_readiness_lookup: data.curriculum_readiness_lookup || '',
    blocked_until_dashboard_sync_review: data.blocked_until_dashboard_sync_review || false,
    blocked_until_drive_ops_review: data.blocked_until_drive_ops_review || false,
    blocked_reason: data.blocked_reason || '',
    created_at: now,
    updated_at: now
  };

  return appendRecord_(APP_CONFIG.SHEETS.PROJECTS, PROJECT_HEADERS, record);
}

function logBug(projectId, summary, options) {
  const opts = options || {};
  return logProjectEvent_(projectId, 'bug', summary, opts);
}

function logDecision(projectId, summary, options) {
  const opts = options || {};
  return logProjectEvent_(projectId, 'decision', summary, opts);
}

function logPerformance(projectId, actionName, durationMs, options) {
  const opts = options || {};
  opts.action_name = actionName;
  opts.duration_ms = durationMs;
  return logProjectEvent_(projectId, 'performance', actionName, opts);
}

function logProjectEvent_(projectId, logType, summary, options) {
  const opts = options || {};
  const record = {
    log_id: opts.log_id || makeId('LOG'),
    project_id: projectId,
    log_type: logType,
    severity: opts.severity || 'info',
    summary: summary || '',
    details: safeString(opts.details),
    root_cause: opts.root_cause || '',
    fix_applied: opts.fix_applied || '',
    prevention_rule: opts.prevention_rule || '',
    action_name: opts.action_name || '',
    duration_ms: opts.duration_ms || '',
    record_count: opts.record_count || '',
    cache_status: opts.cache_status || '',
    status: opts.status || 'open',
    created_at: nowIso(),
    created_by_agent: opts.created_by_agent || 'Apps Script Builder Dashboard'
  };
  return appendRecord_(APP_CONFIG.SHEETS.LOGS, LOG_HEADERS, record);
}

function createHandoffRecord(handoff) {
  const data = handoff || {};
  const record = {
    handoff_id: data.handoff_id || makeId('HANDOFF'),
    project_id: data.project_id || '',
    handoff_type: data.handoff_type || 'review',
    requesting_agent: data.requesting_agent || 'Apps Script Builder Agent',
    target_agent: data.target_agent || '',
    blocked_until_review: data.blocked_until_review || false,
    question_for_owner: data.question_for_owner || '',
    owner_response: data.owner_response || '',
    approved_contract: safeString(data.approved_contract),
    status: data.status || 'open',
    created_at: nowIso(),
    resolved_at: data.resolved_at || ''
  };
  return appendRecord_(APP_CONFIG.SHEETS.HANDOFFS, HANDOFF_HEADERS, record);
}

function logChange(change) {
  const data = change || {};
  const record = {
    change_id: data.change_id || makeId('CHANGE'),
    project_id: data.project_id || '',
    change_type: data.change_type || 'schema',
    changed_field: data.changed_field || '',
    previous_value: safeString(data.previous_value),
    new_value: safeString(data.new_value),
    reason: data.reason || '',
    changed_by_agent: data.changed_by_agent || 'Apps Script Builder Dashboard',
    requires_owner_review: data.requires_owner_review || false,
    created_at: nowIso()
  };
  return appendRecord_(APP_CONFIG.SHEETS.CHANGES, CHANGE_HEADERS, record);
}

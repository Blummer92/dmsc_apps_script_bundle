function filterAppsScriptOperationalPayload(payload) {
  const input = payload || {};
  assertNoRestrictedDirectFields(input);

  const allowed = [
    'project_id',
    'project_name',
    'agent_owner',
    'workspace_target',
    'output_type',
    'generated_artifact',
    'last_synced_at',
    'build_status',
    'deployment_status',
    'project_risk_level',
    'source_document_relation',
    'unit_id_lookup',
    'lesson_id_lookup',
    'packet_id_lookup',
    'curriculum_readiness_lookup',
    'blocked_until_dashboard_sync_review',
    'blocked_until_drive_ops_review',
    'blocked_reason'
  ];

  return allowed.reduce(function(result, key) {
    if (Object.prototype.hasOwnProperty.call(input, key)) result[key] = input[key];
    return result;
  }, {});
}

function assertCurriculumFieldsAreLookupOnly(payload) {
  const input = payload || {};
  assertNoRestrictedDirectFields(input);

  const lookupKeys = [
    'unit_id_lookup',
    'lesson_id_lookup',
    'packet_id_lookup',
    'curriculum_readiness_lookup',
    'source_document_relation'
  ];

  lookupKeys.forEach(function(key) {
    if (Object.prototype.hasOwnProperty.call(input, key) && typeof input[key] === 'object') {
      throw new Error(key + ' must be a simple lookup or relation value.');
    }
  });

  return true;
}

function buildSafeProjectPayload(payload) {
  assertCurriculumFieldsAreLookupOnly(payload);
  return filterAppsScriptOperationalPayload(payload);
}

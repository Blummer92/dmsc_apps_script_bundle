const APP_CONFIG = {
  APP_NAME: 'Apps Script Builder Dashboard',
  VERSION: '0.1.0',
  SHEETS: {
    PROJECTS: 'Apps Script Projects',
    LOGS: 'Project Logs',
    HANDOFFS: 'Handoff Records',
    CHANGES: 'Change Log',
    CONTRACTS: 'Agent/Data Contracts'
  }
};

const APPROVED_SHEETS = [
  APP_CONFIG.SHEETS.PROJECTS,
  APP_CONFIG.SHEETS.LOGS,
  APP_CONFIG.SHEETS.HANDOFFS,
  APP_CONFIG.SHEETS.CHANGES,
  APP_CONFIG.SHEETS.CONTRACTS
];

const PROJECT_HEADERS = [
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
  'blocked_reason',
  'created_at',
  'updated_at'
];

const LOG_HEADERS = [
  'log_id',
  'project_id',
  'log_type',
  'severity',
  'summary',
  'details',
  'root_cause',
  'fix_applied',
  'prevention_rule',
  'action_name',
  'duration_ms',
  'record_count',
  'cache_status',
  'status',
  'created_at',
  'created_by_agent'
];

const HANDOFF_HEADERS = [
  'handoff_id',
  'project_id',
  'handoff_type',
  'requesting_agent',
  'target_agent',
  'blocked_until_review',
  'question_for_owner',
  'owner_response',
  'approved_contract',
  'status',
  'created_at',
  'resolved_at'
];

const CHANGE_HEADERS = [
  'change_id',
  'project_id',
  'change_type',
  'changed_field',
  'previous_value',
  'new_value',
  'reason',
  'changed_by_agent',
  'requires_owner_review',
  'created_at'
];

const CONTRACT_HEADERS = [
  'contract_id',
  'field_name',
  'classification',
  'owner_database',
  'consuming_database',
  'safe_sync_rule',
  'blocked_until_owner_review',
  'notes',
  'updated_at'
];

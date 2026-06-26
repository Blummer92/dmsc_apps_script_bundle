const RESTRICTED_DIRECT_FIELDS = [
  'unit_id',
  'lesson_id',
  'packet_id',
  'readiness_status',
  'source_document',
  'source_authority',
  'generation_approval',
  'packet_approval',
  'evidence_readiness',
  'reuse_approval',
  'final_generation_approval'
];

function validateProjectPayload(project) {
  const payload = project || {};
  assertNoRestrictedDirectFields(payload);
  if (!payload.project_name) throw new Error('project_name is required.');
  if (!payload.agent_owner) throw new Error('agent_owner is required.');
  return true;
}

function assertNoRestrictedDirectFields(payload) {
  const keys = Object.keys(payload || {});
  const matches = keys.filter(function(key) {
    return RESTRICTED_DIRECT_FIELDS.indexOf(key) !== -1;
  });
  if (matches.length) {
    throw new Error('Restricted direct fields are not editable here: ' + matches.join(', '));
  }
  return true;
}

function safeString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function makeId(prefix) {
  return prefix + '-' + Utilities.getUuid();
}

function nowIso() {
  return new Date().toISOString();
}

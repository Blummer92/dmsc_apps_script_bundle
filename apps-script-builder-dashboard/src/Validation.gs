function validateProjectInput_(project) {
  if (!project || typeof project !== 'object') {
    throw new Error('Project input must be an object.');
  }

  const required = ['project_name', 'agent_owner', 'workspace_target', 'output_type'];
  required.forEach((field) => {
    if (!project[field]) {
      throw new Error(`Missing required project field: ${field}`);
    }
  });

  const allowed = new Set(DASHBOARD_SCHEMA.PROJECTS);
  const cleanProject = {};
  Object.keys(project).forEach((key) => {
    if (!allowed.has(key)) {
      throw new Error(`Unsupported project field: ${key}`);
    }
    cleanProject[key] = project[key];
  });

  return cleanProject;
}

function assertNoAuthorityWrites_(value) {
  Object.keys(value).forEach((field) => {
    if (field.endsWith('_lookup')) {
      throw new Error(`${field} is lookup-only and cannot be written by this dashboard.`);
    }
  });

  const blockedEditableFields = [
    'unit_id',
    'lesson_id',
    'packet_id',
    'readiness_status',
    'source_document',
    'source_document_file_id',
    'source_document_url',
    'source_authority',
    'lesson_decision',
    'packet_approval',
    'final_generation_approval',
  ];

  blockedEditableFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      throw new Error(`${field} is authority-bearing curriculum metadata and cannot be written here.`);
    }
  });

  const relationOnlyFields = [
    'source_document_relation',
    'source_document_file_id',
    'source_document_url',
    'unit_id_lookup',
    'lesson_id_lookup',
    'packet_id_lookup',
    'curriculum_readiness_lookup',
  ];

  relationOnlyFields.forEach((field) => {
    if (value[field] && !value.blocked_until_dashboard_sync_review) {
      throw new Error(`${field} requires blocked_until_dashboard_sync_review=true because it is lookup or relation-only.`);
    }
  });
}

function validateLogInput_(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Log entry must be an object.');
  }

  if (!entry.project_id) {
    throw new Error('Log entry requires project_id.');
  }

  if (!entry.log_type) {
    throw new Error('Log entry requires log_type.');
  }

  const allowedTypes = new Set(Object.values(APP_CONFIG.LOG_TYPES));
  if (!allowedTypes.has(entry.log_type)) {
    throw new Error(`Unsupported log_type: ${entry.log_type}`);
  }

  return entry;
}

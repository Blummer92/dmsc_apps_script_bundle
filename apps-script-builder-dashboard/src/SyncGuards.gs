function filterAppsScriptOperationalPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Sync payload must be an object.');
  }

  assertCurriculumFieldsAreLookupOnly(payload);
  assertDeniedSyncFields_(payload);
  assertNoLookupWrites_(payload);
  assertAllowedOperationalFields_(payload);
  const cleanPayload = {};
  Object.keys(payload).forEach((field) => {
    cleanPayload[field] = payload[field];
  });

  return cleanPayload;
}

function assertCurriculumFieldsAreLookupOnly(payload) {
  const blocked = [
    'unit_id',
    'lesson_id',
    'packet_id',
    'readiness_status',
    'source_document',
    'source_authority',
    'curriculum_readiness',
    'lesson_decision',
    'packet_approval',
    'evidence_readiness',
    'reuse_approval',
    'final_generation_approval',
  ];

  blocked.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw new Error(`Blocked curriculum-authority field in sync payload: ${field}`);
    }
  });

  return true;
}

function getSyncMode() {
  return PropertiesService.getScriptProperties()
    .getProperty(APP_CONFIG.PROPERTY_KEYS.SYNC_MODE) || APP_CONFIG.SYNC_MODES.MOCK;
}

function setSyncMode(mode) {
  if (!Object.values(APP_CONFIG.SYNC_MODES).includes(mode)) {
    throw new Error(`Unsupported sync mode: ${mode}`);
  }

  PropertiesService.getScriptProperties()
    .setProperty(APP_CONFIG.PROPERTY_KEYS.SYNC_MODE, mode);

  return { sync_mode: mode };
}

function prepareOperationalSync(payload, currentRecord, options) {
  const syncOptions = options || {};
  const mode = syncOptions.mode || getSyncMode();
  if (mode === APP_CONFIG.SYNC_MODES.LIVE) {
    auditAttemptedLiveSync_(payload, syncOptions);
  }

  const cleanPayload = filterAppsScriptOperationalPayload(payload);
  const diff = buildDryRunDiff_(cleanPayload, currentRecord || {});

  if (mode === APP_CONFIG.SYNC_MODES.LIVE) {
    assertLiveOperationalSyncAllowed_(cleanPayload, syncOptions);
  }

  return {
    sync_mode: mode,
    dry_run: mode !== APP_CONFIG.SYNC_MODES.LIVE || !syncOptions.live_write_confirmed,
    diff,
    writable_fields: WRITABLE_OPERATIONAL_FIELDS.slice(),
    blocked_fields: DENIED_SYNC_FIELDS.slice(),
  };
}

function assertAllowedOperationalFields_(payload) {
  const allowed = new Set(WRITABLE_OPERATIONAL_FIELDS);
  Object.keys(payload).forEach((field) => {
    if (!allowed.has(field)) {
      throw new Error(`Sync blocked for non-operational or authority-bearing field: ${field}`);
    }
  });
}

function assertDeniedSyncFields_(payload) {
  const denied = new Set(DENIED_SYNC_FIELDS);
  Object.keys(payload).forEach((field) => {
    if (denied.has(field)) {
      throw new Error(`Sync blocked by denylist for lookup, relation, readiness, source, curriculum identity, or approval field: ${field}`);
    }
  });
}

function assertNoLookupWrites_(payload) {
  Object.keys(payload).forEach((field) => {
    if (field.endsWith('_lookup')) {
      throw new Error(`Sync blocked for lookup-only field: ${field}`);
    }
  });
}

function assertLiveOperationalSyncAllowed_(payload, options) {
  if (options.external_sync_target && options.external_sync_target !== 'apps_script_operational_metadata') {
    throw new Error('Live Notion, curriculum, or external authority sync remains blocked for MVP.');
  }

  const relationFields = new Set(RELATION_FIELDS);
  Object.keys(payload).forEach((field) => {
    if (relationFields.has(field) && !options.owner_review_confirmed) {
      throw new Error(`Live write blocked for relation field without owner review: ${field}`);
    }
  });

  if (!options.live_write_confirmed) {
    return false;
  }

  return true;
}

function buildDryRunDiff_(payload, currentRecord) {
  return Object.keys(payload).map((field) => ({
    field,
    previous_value: currentRecord[field] === undefined ? '' : currentRecord[field],
    new_value: payload[field],
    changed: currentRecord[field] !== payload[field],
  }));
}

function auditAttemptedLiveSync_(payload, options) {
  const projectId = payload.project_id || (options && options.project_id) || 'system_dashboard';
  return logProjectEvent_({
    project_id: projectId,
    log_type: APP_CONFIG.LOG_TYPES.REVIEW_NOTE,
    severity: 'warning',
    summary: 'Attempted live sync',
    details: JSON.stringify({
      fields: Object.keys(payload),
      external_sync_target: options && options.external_sync_target || 'apps_script_operational_metadata',
      owner_review_confirmed: Boolean(options && options.owner_review_confirmed),
      live_write_confirmed: Boolean(options && options.live_write_confirmed),
    }),
    status: 'audit_recorded',
    created_by_agent: 'Google Apps Script Builder Agent',
  });
}

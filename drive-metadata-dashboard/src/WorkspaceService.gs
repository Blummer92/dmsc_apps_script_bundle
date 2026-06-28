var WorkspaceService = (function() {
  const WORKSPACES = Object.freeze({
    DRIVE_IMAGES: 'Drive Images',
    HANDOFF_RECORDS: 'Handoff Records',
    PROJECT_LOGS: 'Project Logs',
    AGENT_DATA_CONTRACTS: 'Agent Data Contracts',
    CHANGE_LOG: 'Change Log'
  });

  const DEFAULT_WORKSPACE = WORKSPACES.DRIVE_IMAGES;

  function detectWorkspace(activeSheetName) {
    const sheetName = activeSheetName || DEFAULT_WORKSPACE;
    const normalized = normalize_(sheetName);
    const workspaceName = Object.keys(WORKSPACES).map(function(key) {
      return WORKSPACES[key];
    }).filter(function(name) {
      return normalize_(name) === normalized;
    })[0] || sheetName;

    return buildWorkspace_(workspaceName, sheetName);
  }

  function buildWorkspace_(workspaceName, sheetName) {
    const key = normalize_(workspaceName);
    const unsupportedSections = {
      scan: ['Status Header', 'Workspace Preview'],
      review: ['Selected Record'],
      validation: ['Read-only Validation'],
      source: ['Source Summary'],
      handoff: ['Handoff']
    };

    const definitions = {};
    definitions[normalize_(WORKSPACES.DRIVE_IMAGES)] = {
      statusLabel: 'Drive image metadata workflow',
      sections: {
        scan: ['Status Header', "Today's Work", 'Metadata Cleanup', 'Reference Candidates', 'Source Approval Prep', 'Production Blockers'],
        review: ['Selected Record', 'Permission Grid'],
        validation: ['Metadata Cleanup', 'Duplicate Review', 'Production Blockers'],
        source: ['Source Approval Prep'],
        handoff: ['Handoff']
      }
    };
    definitions[normalize_(WORKSPACES.HANDOFF_RECORDS)] = {
      statusLabel: 'Preview/review workspace for manual handoff tracking. Owner writes remain outside this console.',
      sections: {
        scan: ['Pending Handoffs', 'Waiting for Review'],
        review: ['Handoff Details', 'Next Owner', 'Workflow Status'],
        validation: ['Failed Handoffs'],
        source: ['Waiting for Review'],
        handoff: ['Completed Handoffs', 'Handoff Details']
      }
    };
    definitions[normalize_(WORKSPACES.PROJECT_LOGS)] = {
      statusLabel: 'Preview/review workspace for operational logs. Owner writes remain outside this console.',
      sections: {
        scan: ['Recent Activity', 'Performance'],
        review: ['Agent Activity Timeline'],
        validation: ['Errors'],
        source: ['Version History'],
        handoff: ['Recent Activity']
      }
    };
    definitions[normalize_(WORKSPACES.AGENT_DATA_CONTRACTS)] = {
      statusLabel: 'Preview/review workspace for agent data contracts. Owner writes remain outside this console.',
      sections: {
        scan: ['Connected Agents', 'Contract Status'],
        review: ['Version Compatibility', 'Permission Matrix'],
        validation: ['Missing Contracts'],
        source: ['Permission Matrix'],
        handoff: ['Contract Status']
      }
    };
    definitions[normalize_(WORKSPACES.CHANGE_LOG)] = {
      statusLabel: 'Preview/review workspace for change management. Owner writes remain outside this console.',
      sections: {
        scan: ['Recent Changes', 'Version Timeline'],
        review: ['Pending Changes'],
        validation: ['Rollback Candidates'],
        source: ['Version Timeline'],
        handoff: ['Pending Changes']
      }
    };

    const definition = definitions[key] || {
      statusLabel: 'Unmapped sheet workspace',
      sections: unsupportedSections
    };

    return {
      name: workspaceName,
      activeSheetName: sheetName,
      supported: Boolean(definitions[key]),
      statusLabel: definition.statusLabel,
      sections: definition.sections,
      supportedWorkspaces: Object.keys(WORKSPACES).map(function(keyName) {
        return WORKSPACES[keyName];
      })
    };
  }

  function normalize_(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  return {
    detectWorkspace: detectWorkspace
  };
})();

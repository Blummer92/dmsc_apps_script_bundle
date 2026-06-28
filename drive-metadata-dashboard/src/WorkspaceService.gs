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
      handoff: ['Handoff Preview']
    };
    const defaultTabLabels = {
      scan: 'Overview',
      review: 'Review',
      validation: 'Validation',
      source: 'Source Summary',
      handoff: 'Handoff Preview'
    };

    const definitions = {};
    definitions[normalize_(WORKSPACES.DRIVE_IMAGES)] = {
      modeLabel: 'Drive Metadata',
      statusLabel: 'Drive image metadata workflow',
      tabLabels: {
        scan: 'Overview',
        review: 'Metadata',
        validation: 'Duplicates',
        source: 'Source Prep',
        handoff: 'Handoff Preview'
      },
      sections: {
        scan: ['Status Header', "Today's Work", 'Metadata Cleanup', 'Reference Candidates', 'Source Approval Prep', 'Production Blockers'],
        review: ['Selected Record', 'Permission Grid'],
        validation: ['Metadata Cleanup', 'Duplicate Review', 'Production Blockers'],
        source: ['Source Approval Prep'],
        handoff: ['Handoff Preview']
      }
    };
    definitions[normalize_(WORKSPACES.HANDOFF_RECORDS)] = {
      modeLabel: 'Handoff Review',
      statusLabel: 'Preview/review workspace for manual handoff tracking. Owner writes remain outside this console.',
      tabLabels: {
        scan: 'Overview',
        review: 'Pending',
        validation: 'Waiting Review',
        source: 'Completed',
        handoff: 'Failed'
      },
      sections: {
        scan: ['Pending Handoffs', 'Waiting for Review'],
        review: ['Handoff Details', 'Next Owner', 'Workflow Status'],
        validation: ['Failed Handoffs'],
        source: ['Waiting for Review'],
        handoff: ['Completed Handoffs', 'Handoff Details']
      }
    };
    definitions[normalize_(WORKSPACES.PROJECT_LOGS)] = {
      modeLabel: 'Project Logs',
      statusLabel: 'Preview/review workspace for operational logs. Owner writes remain outside this console.',
      tabLabels: {
        scan: 'Overview',
        review: 'Activity',
        validation: 'Errors',
        source: 'Performance',
        handoff: 'Versions'
      },
      sections: {
        scan: ['Recent Activity', 'Performance'],
        review: ['Agent Activity Timeline'],
        validation: ['Errors'],
        source: ['Version History'],
        handoff: ['Recent Activity']
      }
    };
    definitions[normalize_(WORKSPACES.AGENT_DATA_CONTRACTS)] = {
      modeLabel: 'Agent Contracts',
      statusLabel: 'Preview/review workspace for agent data contracts. Owner writes remain outside this console.',
      tabLabels: {
        scan: 'Overview',
        review: 'Agents',
        validation: 'Contracts',
        source: 'Missing',
        handoff: 'Permissions'
      },
      sections: {
        scan: ['Connected Agents', 'Contract Status'],
        review: ['Version Compatibility', 'Permission Matrix'],
        validation: ['Missing Contracts'],
        source: ['Permission Matrix'],
        handoff: ['Contract Status']
      }
    };
    definitions[normalize_(WORKSPACES.CHANGE_LOG)] = {
      modeLabel: 'Change Log',
      statusLabel: 'Preview/review workspace for change management. Owner writes remain outside this console.',
      tabLabels: {
        scan: 'Overview',
        review: 'Recent',
        validation: 'Pending',
        source: 'Versions',
        handoff: 'Rollback'
      },
      sections: {
        scan: ['Recent Changes', 'Version Timeline'],
        review: ['Pending Changes'],
        validation: ['Rollback Candidates'],
        source: ['Version Timeline'],
        handoff: ['Pending Changes']
      }
    };

    const definition = definitions[key] || {
      modeLabel: 'Preview',
      statusLabel: 'Unmapped sheet workspace',
      tabLabels: defaultTabLabels,
      sections: unsupportedSections
    };

    return {
      name: workspaceName,
      activeSheetName: sheetName,
      supported: Boolean(definitions[key]),
      modeLabel: definition.modeLabel,
      statusLabel: definition.statusLabel,
      tabLabels: definition.tabLabels,
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

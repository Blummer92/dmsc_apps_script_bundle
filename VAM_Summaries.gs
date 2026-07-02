function vamSummarizeIssues_(issues) {
  const summary = {
    missingRequiredFields: 0,
    invalidStatusValues: 0,
    duplicateAssetIds: 0,
    rowsBlockedFromAdvancing: 0,
    warnings: 0,
    suggestions: 0,
    totalIssues: issues.length
  };
  issues.forEach(function(issue) {
    if (issue.category === 'Missing Required Field') summary.missingRequiredFields++;
    if (issue.category === 'Invalid Controlled Value') summary.invalidStatusValues++;
    if (issue.category === 'Duplicate Asset ID') summary.duplicateAssetIds++;
    if (issue.category === 'Blocked From Advancing') summary.rowsBlockedFromAdvancing++;
    if (issue.severity === 'Warning') summary.warnings++;
    if (issue.severity === 'Info') summary.suggestions++;
  });
  return summary;
}

function vamBuildTopFixes_(issues, limit) {
  const groups = {};
  issues.forEach(function(issue) {
    const fieldName = issue.fieldName || 'General';
    const category = issue.category || 'General';
    const stage = issue.stage || '';
    const key = [category, fieldName, stage].join('||');
    if (!groups[key]) {
      groups[key] = {
        category: category,
        fieldName: fieldName,
        stage: stage,
        count: 0,
        sampleRows: [],
        recommendation: vamRecommendTopFix_(issue)
      };
    }
    groups[key].count++;
    if (issue.rowNumber && groups[key].sampleRows.length < 8) {
      groups[key].sampleRows.push(issue.rowNumber);
    }
    if (!groups[key].recommendation && issue.suggestion) {
      groups[key].recommendation = issue.suggestion;
    }
  });

  return Object.keys(groups)
    .map(function(key) {
      return groups[key];
    })
    .sort(function(a, b) {
      if (b.count !== a.count) return b.count - a.count;
      if (a.category !== b.category) return a.category < b.category ? -1 : 1;
      return a.fieldName < b.fieldName ? -1 : 1;
    })
    .slice(0, limit)
    .map(function(fix, index) {
      return {
        rank: index + 1,
        count: fix.count,
        category: fix.category,
        fieldName: fix.fieldName,
        stage: fix.stage,
        recommendation: fix.recommendation || 'Review the grouped warning rows and resolve the underlying metadata issue.',
        sampleRows: fix.sampleRows.join(', ')
      };
    });
}

function vamBuildStatusSummary_(context) {
  const statusField = VAM_GOV_CONFIG.fields.metadataStatus;
  const targetStatuses = ['Blocked', 'Needs Human Review', 'Needs Metadata', 'Complete'];
  const groups = targetStatuses.reduce(function(map, status) {
    map[status] = {
      status: status,
      count: 0,
      sampleRows: [],
      recommendation: vamRecommendStatusAction_(status)
    };
    return map;
  }, {});

  if (!vamHasHeader_(context.headerMap, statusField)) {
    return targetStatuses.map(function(status) {
      return {
        status: status,
        count: 0,
        sampleRows: '',
        recommendation: 'Metadata Status column was not found.'
      };
    });
  }

  context.records.forEach(function(record) {
    const status = vamClean_(record.values[statusField]);
    if (!groups[status]) return;
    groups[status].count++;
    if (groups[status].sampleRows.length < 8) {
      groups[status].sampleRows.push(record.rowNumber);
    }
  });

  return targetStatuses.map(function(status) {
    const group = groups[status];
    return {
      status: group.status,
      count: group.count,
      sampleRows: group.sampleRows.join(', '),
      recommendation: group.recommendation
    };
  });
}

function vamBuildDriveFileReviewQueue_(issues, limit) {
  return issues
    .filter(function(issue) {
      return issue.category === 'Drive File ID Suggestion' || issue.category === 'Drive File ID Mismatch';
    })
    .slice(0, limit)
    .map(function(issue) {
      return {
        rowNumber: issue.rowNumber,
        assetId: issue.assetId,
        category: issue.category,
        fieldName: issue.fieldName,
        recommendation: issue.suggestion || 'Review Drive link and exact file mapping.',
        severity: issue.severity
      };
    });
}

function vamBuildDuplicateAssetIdGroups_(context, limit) {
  const fieldName = VAM_GOV_CONFIG.fields.assetId;
  if (!vamHasHeader_(context.headerMap, fieldName)) return [];

  const groups = {};
  context.records.forEach(function(record) {
    const assetId = vamClean_(record.values[fieldName]);
    if (!assetId) return;
    const key = vamCompare_(assetId);
    groups[key] = groups[key] || { assetId: assetId, rows: [] };
    groups[key].rows.push(record.rowNumber);
  });

  return Object.keys(groups)
    .map(function(key) {
      return groups[key];
    })
    .filter(function(group) {
      return group.rows.length > 1;
    })
    .sort(function(a, b) {
      if (b.rows.length !== a.rows.length) return b.rows.length - a.rows.length;
      return a.assetId < b.assetId ? -1 : 1;
    })
    .slice(0, limit)
    .map(function(group) {
      return {
        assetId: group.assetId,
        count: group.rows.length,
        rows: group.rows.join(', '),
        recommendation: 'Resolve duplicate identity or document the duplicate relationship before advancing.'
      };
    });
}

function vamBuildWorkflowBlockerSummary_(issues, limit) {
  const groups = {};
  issues
    .filter(function(issue) {
      return issue.category === 'Blocked From Advancing';
    })
    .forEach(function(issue) {
      const nextStepMatch = issue.message.match(/"([^"]+)"/);
      const nextStep = nextStepMatch ? nextStepMatch[1] : '';
      const key = [issue.stage || 'Workflow', nextStep].join('||');
      groups[key] = groups[key] || {
        stage: issue.stage || 'Workflow',
        nextStep: nextStep,
        count: 0,
        sampleRows: [],
        recommendation: issue.suggestion || 'Complete the missing stage-gate fields before advancing workflow.'
      };
      groups[key].count++;
      if (issue.rowNumber && groups[key].sampleRows.length < 8) {
        groups[key].sampleRows.push(issue.rowNumber);
      }
    });

  return Object.keys(groups)
    .map(function(key) {
      return groups[key];
    })
    .sort(function(a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return a.stage < b.stage ? -1 : 1;
    })
    .slice(0, limit)
    .map(function(group) {
      return {
        stage: group.stage,
        nextStep: group.nextStep,
        count: group.count,
        sampleRows: group.sampleRows.join(', '),
        recommendation: group.recommendation
      };
    });
}

function vamRecommendStatusAction_(status) {
  if (status === 'Blocked') return 'Review blocker details before any workflow advancement.';
  if (status === 'Needs Human Review') return 'Assign or complete human review before approval.';
  if (status === 'Needs Metadata') return 'Complete required metadata fields first.';
  if (status === 'Complete') return 'No immediate action; spot-check completed records as needed.';
  return 'Review status.';
}

function vamRecommendTopFix_(issue) {
  if (issue.category === 'Missing Required Field') {
    return 'Complete this required field or document a blocker for the listed rows.';
  }
  if (issue.category === 'Invalid Controlled Value') {
    return issue.suggestion || 'Replace values with the approved controlled vocabulary.';
  }
  if (issue.category === 'Duplicate Asset ID') {
    return 'Resolve duplicate identity or document the duplicate relationship before advancing.';
  }
  if (issue.category === 'Blocked From Advancing') {
    return issue.suggestion || 'Complete the missing stage-gate fields before advancing workflow.';
  }
  if (issue.category === 'Drive File ID Suggestion') {
    return 'Review the parsed Drive File ID suggestion before writing any value to the asset row.';
  }
  if (issue.category === 'Drive File ID Mismatch') {
    return 'Review exact Drive file mapping before changing the Drive File ID.';
  }
  if (issue.category === 'Canonical Filename Suggestion') {
    return 'Review the suggested canonical filename before writing any value to the asset row.';
  }
  return issue.suggestion || 'Review the grouped warning rows and resolve the metadata issue.';
}

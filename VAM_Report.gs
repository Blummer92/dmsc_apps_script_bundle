function buildVisualAssetValidationReport() {
  vamLog_('REPORT_BUILD_START', {
    requiredFieldCount: VAM_GOV_CONFIG.requiredFields.length,
    controlledFieldCount: Object.keys(VAM_GOV_CONFIG.controlledValues).length,
    workflowStageCount: VAM_GOV_CONFIG.workflowStages.length
  });
  const context = vamReadAssetRows_();
  const issues = [];
  vamPushIssuesWithLog_(issues, 'required fields', vamValidateMissingRequiredFields_(context));
  vamPushIssuesWithLog_(issues, 'controlled values', vamValidateControlledValues_(context));
  vamPushIssuesWithLog_(issues, 'Drive File ID extraction', vamValidateDriveFileIds_(context));
  vamPushIssuesWithLog_(issues, 'Canonical Filename suggestions', vamValidateCanonicalFilenames_(context));
  vamPushIssuesWithLog_(issues, 'duplicate Asset IDs', vamValidateDuplicateAssetIds_(context));
  vamPushIssuesWithLog_(issues, 'workflow stage gates', vamValidateWorkflowStages_(context));

  const summary = vamSummarizeIssues_(issues);
  const topFixes = vamBuildTopFixes_(issues, 5);
  const statusSummary = vamBuildStatusSummary_(context);
  const driveFileReviewQueue = vamBuildDriveFileReviewQueue_(issues, 10);
  const duplicateAssetIdGroups = vamBuildDuplicateAssetIdGroups_(context, 10);
  const workflowBlockerSummary = vamBuildWorkflowBlockerSummary_(issues, 10);
  vamLog_('REPORT_BUILD_COMPLETE', {
    rowCount: context.records.length,
    totalIssues: summary.totalIssues,
    warnings: summary.warnings,
    suggestions: summary.suggestions,
    topFixCount: topFixes.length,
    statusGroupCount: statusSummary.length,
    driveReviewCount: driveFileReviewQueue.length,
    duplicateGroupCount: duplicateAssetIdGroups.length,
    workflowBlockerGroupCount: workflowBlockerSummary.length
  });
  vamLogTopFixes_(topFixes);
  vamLogStatusSummary_(statusSummary);
  vamLogDriveReviewQueue_(driveFileReviewQueue);
  vamLogDuplicateGroups_(duplicateAssetIdGroups);
  vamLogWorkflowBlockers_(workflowBlockerSummary);
  vamLogSampleIssues_(issues);

  return {
    generatedAt: Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    rowCount: context.records.length,
    warningOnly: true,
    issues: issues,
    summary: summary,
    topFixes: topFixes,
    statusSummary: statusSummary,
    driveFileReviewQueue: driveFileReviewQueue,
    duplicateAssetIdGroups: duplicateAssetIdGroups,
    workflowBlockerSummary: workflowBlockerSummary
  };
}

function vamPushIssuesWithLog_(targetIssues, validationName, newIssues) {
  Array.prototype.push.apply(targetIssues, newIssues);
  vamLog_('VALIDATION_STEP', {
    validation: validationName,
    newIssueCount: newIssues.length,
    runningIssueCount: targetIssues.length
  });
}

function vamLogSampleIssues_(issues) {
  issues.slice(0, 10).forEach(function(issue, index) {
    vamLog_('ISSUE_SAMPLE_' + (index + 1), {
      rowNumber: issue.rowNumber,
      assetId: issue.assetId,
      severity: issue.severity,
      category: issue.category,
      fieldName: issue.fieldName,
      stage: issue.stage,
      message: issue.message,
      suggestion: issue.suggestion
    });
  });
  if (issues.length > 10) {
    vamLog_('ISSUE_SAMPLE_TRUNCATED', {
      shown: 10,
      remaining: issues.length - 10
    });
  }
}

function vamLogTopFixes_(topFixes) {
  topFixes.forEach(function(fix) {
    vamLog_('TOP_FIX', {
      rank: fix.rank,
      count: fix.count,
      category: fix.category,
      fieldName: fix.fieldName,
      stage: fix.stage,
      sampleRows: fix.sampleRows,
      recommendation: fix.recommendation
    });
  });
  if (!topFixes.length) {
    vamLog_('TOP_FIXES_EMPTY', {
      message: 'No top fixes generated because no issues were found.'
    });
  }
}

function vamLogStatusSummary_(statusSummary) {
  statusSummary.forEach(function(group) {
    vamLog_('STATUS_SUMMARY', {
      status: group.status,
      count: group.count,
      sampleRows: group.sampleRows,
      recommendation: group.recommendation
    });
  });
}

function vamLogDriveReviewQueue_(queue) {
  queue.slice(0, 5).forEach(function(item) {
    vamLog_('DRIVE_ID_REVIEW', {
      rowNumber: item.rowNumber,
      assetId: item.assetId,
      category: item.category,
      recommendation: item.recommendation
    });
  });
  if (queue.length > 5) {
    vamLog_('DRIVE_ID_REVIEW_TRUNCATED', {
      shown: 5,
      remaining: queue.length - 5
    });
  }
}

function vamLogDuplicateGroups_(groups) {
  groups.slice(0, 5).forEach(function(group) {
    vamLog_('DUPLICATE_ASSET_GROUP', {
      assetId: group.assetId,
      count: group.count,
      rows: group.rows
    });
  });
  if (groups.length > 5) {
    vamLog_('DUPLICATE_ASSET_GROUPS_TRUNCATED', {
      shown: 5,
      remaining: groups.length - 5
    });
  }
}

function vamLogWorkflowBlockers_(groups) {
  groups.slice(0, 5).forEach(function(group) {
    vamLog_('WORKFLOW_BLOCKER_SUMMARY', {
      stage: group.stage,
      nextStep: group.nextStep,
      count: group.count,
      sampleRows: group.sampleRows
    });
  });
  if (groups.length > 5) {
    vamLog_('WORKFLOW_BLOCKERS_TRUNCATED', {
      shown: 5,
      remaining: groups.length - 5
    });
  }
}

function getVisualAssetMissingRequiredFields() {
  return buildVisualAssetValidationReport().issues.filter(function(issue) {
    return issue.category === 'Missing Required Field';
  });
}

function getVisualAssetDriveFileIdSuggestions() {
  return buildVisualAssetValidationReport().issues.filter(function(issue) {
    return issue.category === 'Drive File ID Suggestion' || issue.category === 'Drive File ID Mismatch';
  });
}

function getVisualAssetCanonicalFilenameSuggestions() {
  return buildVisualAssetValidationReport().issues.filter(function(issue) {
    return issue.category === 'Canonical Filename Suggestion';
  });
}

function getVisualAssetStatusReviewSummary() {
  return buildVisualAssetValidationReport().statusSummary;
}

function getVisualAssetDriveFileIdReviewQueue() {
  return buildVisualAssetValidationReport().driveFileReviewQueue;
}

function getVisualAssetDuplicateAssetIdGroups() {
  return buildVisualAssetValidationReport().duplicateAssetIdGroups;
}

function getVisualAssetWorkflowBlockers() {
  return buildVisualAssetValidationReport().workflowBlockerSummary;
}

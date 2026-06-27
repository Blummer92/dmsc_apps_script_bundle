/**
 * Metadata validation helpers for builder registry rows.
 */
function validateBuilderRegistryProject(project) {
  const missingFields = REQUIRED_REGISTRY_FIELDS.filter((field) => {
    return !project.raw[field];
  });

  if (missingFields.length) {
    console.log(
      `Registry row ${project.rowNumber} is missing metadata: ${missingFields.join(', ')}`
    );
  }

  const builderStatus = project.raw[CONFIG.FIELDS.BUILDER_STATUS] || '';
  const blockingIssue = project.raw[CONFIG.FIELDS.BLOCKING_ISSUE] || '';
  const isBlocked = isBlockedBuilderProject_(builderStatus, blockingIssue);
  const isReady = isReadyBuilderProject_(builderStatus, blockingIssue, missingFields);

  return {
    rowNumber: project.rowNumber,
    projectName: project.raw[CONFIG.FIELDS.SCRIPT_PROJECT_NAME] || '',
    builderStatus,
    nextAction: project.raw[CONFIG.FIELDS.NEXT_ACTION] || '',
    blockingIssue,
    appsScriptProjectId: project.raw[CONFIG.FIELDS.APPS_SCRIPT_PROJECT_ID] || '',
    scriptUrl: project.raw[CONFIG.FIELDS.SCRIPT_URL] || '',
    driveFileId: project.raw[CONFIG.FIELDS.DRIVE_FILE_ID] || '',
    githubRepository: project.raw[CONFIG.FIELDS.GITHUB_REPOSITORY] || '',
    branch: project.raw[CONFIG.FIELDS.BRANCH] || '',
    missingFields,
    isReady,
    isBlocked,
  };
}

function validateBuilderRegistryProjects(projects) {
  return projects.map(validateBuilderRegistryProject);
}

function isReadyBuilderProject_(builderStatus, blockingIssue, missingFields) {
  return builderStatus.toLowerCase() === CONFIG.BUILDER_STATUSES.READY.toLowerCase()
    && blockingIssue === ''
    && missingFields.length === 0;
}

function isBlockedBuilderProject_(builderStatus, blockingIssue) {
  return builderStatus.toLowerCase() === CONFIG.BUILDER_STATUSES.BLOCKED.toLowerCase()
    || blockingIssue !== '';
}

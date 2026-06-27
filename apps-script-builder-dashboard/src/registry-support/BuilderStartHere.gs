/**
 * Builder Start Here report generation and UI entry points.
 */
function runBuilderStartHere() {
  const registry = readBuilderRegistryRows();
  const validations = validateBuilderRegistryProjects(registry.rows);
  const report = buildBuilderStartHereReport(validations);

  console.log(JSON.stringify(report, null, 2));
  return report;
}

function validateAppsScriptProjectRegistry() {
  const registry = readBuilderRegistryRows();
  const validations = validateBuilderRegistryProjects(registry.rows);

  return {
    generatedAt: new Date().toISOString(),
    safeMode: true,
    requiredHeaders: BUILDER_REGISTRY_REQUIRED_HEADERS,
    requiredMetadataFields: BUILDER_REGISTRY_REQUIRED_METADATA_FIELDS,
    projects: validations.map(toBuilderStartHereProject_),
  };
}

function getBuilderStartHereJson() {
  return JSON.stringify(runBuilderStartHere(), null, 2);
}

function buildBuilderStartHereReport(validations) {
  const readyProjects = validations.filter((project) => project.isReady);
  const blockedProjects = validations.filter((project) => project.isBlocked);
  const projectsMissingMetadata = validations.filter((project) => {
    return project.missingFields.length > 0;
  });

  return {
    summary: {
      totalProjects: validations.length,
      readyProjects: readyProjects.length,
      blockedProjects: blockedProjects.length,
      projectsMissingMetadata: projectsMissingMetadata.length,
    },
    safeMode: true,
    readyProjects: readyProjects.map(toBuilderStartHereProject_),
    blockedProjects: blockedProjects.map(toBuilderStartHereProject_),
    projectsMissingMetadata: projectsMissingMetadata.map(toBuilderStartHereProject_),
  };
}

function toBuilderStartHereProject_(validation) {
  return {
    rowNumber: validation.rowNumber,
    projectName: validation.projectName,
    builderStatus: validation.builderStatus,
    nextAction: validation.nextAction,
    blockingIssue: validation.blockingIssue,
    appsScriptProjectId: validation.appsScriptProjectId,
    scriptUrl: validation.scriptUrl,
    driveFileId: validation.driveFileId,
    githubRepository: validation.githubRepository,
    branch: validation.branch,
    missingFields: validation.missingFields,
  };
}

function getBuilderStartHereHtml() {
  const template = HtmlService.createTemplateFromFile('BuilderRegistryUi');
  template.reportJson = getBuilderStartHereJson();

  return template.evaluate()
    .setTitle(BUILDER_REGISTRY_CONFIG.OUTPUT.START_HERE_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

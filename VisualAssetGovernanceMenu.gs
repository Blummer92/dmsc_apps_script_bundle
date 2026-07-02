/**
 * Standalone-safe controls for the Visual Asset Metadata governance validator.
 *
 * This Apps Script project is deployed as a standalone project, so SpreadsheetApp.getUi()
 * is not available. Use these functions from the Apps Script editor or install the
 * daily trigger below. The validator still writes only to the Validation Dashboard tab.
 */

function runVisualAssetValidationDashboardNow() {
  return runVisualAssetValidationDashboard();
}

function installDailyVisualAssetValidationTrigger() {
  removeVisualAssetValidationTriggers();
  ScriptApp.newTrigger('runVisualAssetValidationDashboard')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();
  return 'Installed daily Visual Asset validation trigger for approximately 7 AM in the script timezone.';
}

function removeVisualAssetValidationTriggers() {
  const handlers = {
    runVisualAssetValidationDashboard: true,
    showVisualAssetGovernanceMenu: true
  };
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (handlers[trigger.getHandlerFunction()]) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  return 'Removed ' + removed + ' Visual Asset validation trigger(s).';
}

function getVisualAssetValidationSummary() {
  return buildVisualAssetValidationReport().summary;
}

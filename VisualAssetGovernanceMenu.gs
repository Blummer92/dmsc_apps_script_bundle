/**
 * Optional menu wiring for the Visual Asset Metadata governance validator.
 *
 * This file intentionally avoids defining another onOpen() function because Code.gs
 * already owns the existing DMSC Dashboard menu. Instead, run
 * installVisualAssetGovernanceMenuTrigger() once to add an installable open trigger
 * for this separate menu.
 */

function installVisualAssetGovernanceMenuTrigger() {
  removeVisualAssetGovernanceMenuTriggers_();
  ScriptApp.newTrigger('showVisualAssetGovernanceMenu')
    .forSpreadsheet(VAM_GOV_CONFIG.spreadsheetId)
    .onOpen()
    .create();
  showVisualAssetGovernanceMenu();
}

function removeVisualAssetGovernanceMenuTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'showVisualAssetGovernanceMenu') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function showVisualAssetGovernanceMenu() {
  SpreadsheetApp.getUi()
    .createMenu('Visual Asset Governance')
    .addItem('Refresh Validation Dashboard', 'runVisualAssetValidationDashboardFromMenu')
    .addItem('Show Missing Required Count', 'showVisualAssetMissingRequiredCount')
    .addSeparator()
    .addItem('Remove Visual Asset Menu Trigger', 'removeVisualAssetGovernanceMenuTriggers_')
    .addToUi();
}

function runVisualAssetValidationDashboardFromMenu() {
  const summary = runVisualAssetValidationDashboard();
  SpreadsheetApp.getUi().alert(
    'Visual Asset validation complete.\n\n' +
    'Warnings: ' + summary.warnings + '\n' +
    'Suggestions: ' + summary.suggestions + '\n' +
    'Duplicate Asset IDs: ' + summary.duplicateAssetIds + '\n' +
    'Rows blocked from advancing: ' + summary.rowsBlockedFromAdvancing
  );
  return summary;
}

function showVisualAssetMissingRequiredCount() {
  const missing = getVisualAssetMissingRequiredFields();
  SpreadsheetApp.getUi().alert(
    'Missing required field warnings: ' + missing.length + '\n\n' +
    'Open the Validation Dashboard tab for row-level details.'
  );
  return missing.length;
}

/**
 * Runtime property helpers for quick Visual Asset Governance testing.
 *
 * This module does not write asset rows. Its only write surface is
 * PropertiesService, used to compare one validation run to the previous run.
 */

const VAM_QUICK_PROPERTY_KEYS = Object.freeze({
  lastValidationSummary: 'VAM_LAST_VALIDATION_SUMMARY',
  featureFlags: 'VAM_FEATURE_FLAGS'
});

function saveVisualAssetLastValidationSummary() {
  const report = buildVisualAssetValidationReport();
  const summary = vamQuickBuildRunSummary_(report);
  vamQuickGetScriptProperties_().setProperty(
    VAM_QUICK_PROPERTY_KEYS.lastValidationSummary,
    JSON.stringify(summary)
  );
  vamQuickLog_('SAVE_LAST_VALIDATION_SUMMARY', {
    totalIssues: summary.totalIssues,
    warnings: summary.warnings,
    suggestions: summary.suggestions,
    rowCount: summary.rowCount,
    writeSurface: 'PropertiesService only'
  });
  return summary;
}

function getVisualAssetPreviousRunComparison() {
  const previous = vamQuickReadJsonProperty_(VAM_QUICK_PROPERTY_KEYS.lastValidationSummary, null);
  const current = vamQuickBuildRunSummary_(buildVisualAssetValidationReport());
  const comparison = {
    hasPreviousRun: !!previous,
    previous: previous,
    current: current,
    deltas: previous ? {
      rowCount: current.rowCount - previous.rowCount,
      totalIssues: current.totalIssues - previous.totalIssues,
      warnings: current.warnings - previous.warnings,
      suggestions: current.suggestions - previous.suggestions,
      missingRequiredFields: current.missingRequiredFields - previous.missingRequiredFields,
      invalidStatusValues: current.invalidStatusValues - previous.invalidStatusValues,
      duplicateAssetIds: current.duplicateAssetIds - previous.duplicateAssetIds,
      rowsBlockedFromAdvancing: current.rowsBlockedFromAdvancing - previous.rowsBlockedFromAdvancing
    } : {}
  };
  vamQuickLog_('PREVIOUS_RUN_COMPARISON', comparison.deltas);
  return comparison;
}

function getVisualAssetRuntimeProperties() {
  const properties = vamQuickGetScriptProperties_().getProperties();
  return Object.keys(properties)
    .filter(function(key) { return key.indexOf('VAM_') === 0; })
    .sort()
    .map(function(key) {
      return {
        key: key,
        valueLength: String(properties[key] || '').length,
        preview: String(properties[key] || '').slice(0, 200)
      };
    });
}

function clearVisualAssetRuntimeProperties() {
  const store = vamQuickGetScriptProperties_();
  Object.keys(store.getProperties()).forEach(function(key) {
    if (key.indexOf('VAM_') === 0) {
      store.deleteProperty(key);
    }
  });
  vamQuickLog_('CLEAR_RUNTIME_PROPERTIES', {
    writeSurface: 'PropertiesService only',
    assetRowsChanged: 0
  });
  return getVisualAssetRuntimeProperties();
}

function setVisualAssetFeatureFlag(flagName, enabled) {
  const flags = getVisualAssetFeatureFlags();
  flags[vamClean_(flagName)] = enabled === true;
  vamQuickGetScriptProperties_().setProperty(
    VAM_QUICK_PROPERTY_KEYS.featureFlags,
    JSON.stringify(flags)
  );
  vamQuickLog_('SET_FEATURE_FLAG', {
    flagName: flagName,
    enabled: enabled === true,
    writeSurface: 'PropertiesService only'
  });
  return flags;
}

function getVisualAssetFeatureFlags() {
  return vamQuickReadJsonProperty_(VAM_QUICK_PROPERTY_KEYS.featureFlags, {});
}

function vamQuickBuildRunSummary_(report) {
  return {
    generatedAt: report.generatedAt,
    rowCount: report.rowCount,
    warningOnly: report.warningOnly === true,
    totalIssues: report.summary.totalIssues,
    warnings: report.summary.warnings,
    suggestions: report.summary.suggestions,
    missingRequiredFields: report.summary.missingRequiredFields,
    invalidStatusValues: report.summary.invalidStatusValues,
    duplicateAssetIds: report.summary.duplicateAssetIds,
    rowsBlockedFromAdvancing: report.summary.rowsBlockedFromAdvancing,
    topFixCount: report.topFixes.length,
    driveFileReviewCount: report.driveFileReviewQueue.length,
    duplicateGroupCount: report.duplicateAssetIdGroups.length,
    workflowBlockerGroupCount: report.workflowBlockerSummary.length
  };
}

function vamQuickGetScriptProperties_() {
  return PropertiesService.getScriptProperties();
}

function vamQuickReadJsonProperty_(key, fallback) {
  const raw = vamQuickGetScriptProperties_().getProperty(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    vamQuickLog_('PROPERTY_PARSE_WARNING', {
      key: key,
      message: error.message
    });
    return fallback;
  }
}

function vamQuickLog_(eventName, details) {
  const payload = {
    event: eventName,
    timestamp: Utilities.formatDate(new Date(), VAM_GOV_CONFIG.timezone, 'yyyy-MM-dd HH:mm:ss z'),
    details: details || {}
  };
  Logger.log('[VAM_QUICK] ' + JSON.stringify(payload));
}

function getVamFeatureRegistrySummary() {
  const registry = getVamFeatureRegistryItemsForSmoke_();
  const unavailable = getUnavailableVamFeatures();
  const guarded = getGuardedVamFeatures();

  return {
    featureCount: registry.length,
    availableHandlers: registry.length - unavailable.length,
    unavailableHandlers: unavailable.length,
    guardedFeatures: guarded.length,
    version: getVamFeatureRegistryVersionForSmoke_()
  };
}

function getUnavailableVamFeatures() {
  return getVamFeatureRegistryItemsForSmoke_().filter(function(feature) {
    return !feature.handler || typeof globalThis[feature.handler] !== 'function';
  });
}

function getGuardedVamFeatures() {
  return getVamFeatureRegistryItemsForSmoke_().filter(function(feature) {
    const status = String(feature.status || '').toLowerCase();
    const mode = String(feature.runMode || feature.mode || '').toLowerCase();
    return status === 'guarded' || mode === 'guarded' || mode === 'sheet-write' || mode === 'write';
  });
}

function getVamFeatureRegistryItemsForSmoke_() {
  if (typeof getVamFeatureRegistry === 'function') return getVamFeatureRegistry();
  if (typeof getVamFeatureRegistry_ === 'function') return getVamFeatureRegistry_();
  if (typeof buildVamFeatureRegistry_ === 'function') return buildVamFeatureRegistry_();
  if (typeof getVamFeatureRegistryRows_ === 'function') return getVamFeatureRegistryRows_();

  if (typeof VAM_FEATURE_REGISTRY !== 'undefined' && Array.isArray(VAM_FEATURE_REGISTRY)) {
    return VAM_FEATURE_REGISTRY;
  }

  if (typeof VAM_FEATURE_REGISTRY_CONFIG !== 'undefined' && Array.isArray(VAM_FEATURE_REGISTRY_CONFIG.features)) {
    return VAM_FEATURE_REGISTRY_CONFIG.features;
  }

  throw new Error('No VAM feature registry source found.');
}

function getVamFeatureRegistryVersionForSmoke_() {
  if (typeof VAM_FEATURE_REGISTRY_CONFIG !== 'undefined' && VAM_FEATURE_REGISTRY_CONFIG.version) {
    return VAM_FEATURE_REGISTRY_CONFIG.version;
  }
  return 'unknown';
}

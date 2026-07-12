var AssetTypeMappingService = (function() {
  function map(rawValue, propertySchema) {
    return ControlledVocabularyService.map('Asset type', rawValue, propertySchema);
  }

  return {
    map: map
  };
})();

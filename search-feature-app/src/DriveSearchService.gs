const DriveSearchService = (function() {
  function search(normalizedQuery, filters, config) {
    if (!config.driveFolderIds.length) {
      console.warn('Drive search skipped because no Drive folder IDs are configured.');
      return [];
    }

    const results = [];

    config.driveFolderIds.forEach(function(folderId) {
      try {
        const folder = DriveApp.getFolderById(folderId);
        collectFolderMatches_(folder, normalizedQuery, filters, results, config);
      } catch (error) {
        console.error('Drive folder search failed', {
          folderId: folderId,
          message: error.message,
          stack: error.stack
        });
      }
    });

    return results;
  }

  function collectFolderMatches_(folder, normalizedQuery, filters, results, config) {
    const files = folder.getFiles();
    let inspected = 0;

    while (files.hasNext() && inspected < config.maxDriveFilesPerFolder) {
      inspected += 1;
      const file = files.next();
      const result = fileToResultIfMatch_(file, normalizedQuery, filters, folder, config);

      if (result) {
        results.push(result);
      }
    }
  }

  function fileToResultIfMatch_(file, normalizedQuery, filters, folder, config) {
    const name = file.getName();
    const mimeType = file.getMimeType();
    const description = safeGetDescription_(file);
    const sourceSystem = 'Google Drive';
    const duplicateResolutionStatus = 'review_required';
    const fileUrl = file.getUrl();

    if (hasMetadataOnlyFilters_(filters)) {
      return null;
    }

    const outputType = mapMimeTypeToOutputType_(mimeType);
    if (!filterMatchesValue_(outputType, filters[APP_CONFIG.FIELDS.OUTPUT_TYPE])) {
      return null;
    }

    if (normalizedQuery && !valueMatchesQuery_(name, normalizedQuery) && !valueMatchesQuery_(description, normalizedQuery)) {
      return null;
    }

    return {
      source: 'drive',
      sourceLabel: 'Google Drive',
      title: name,
      type: outputType,
      fileUrl: fileUrl,
      matchReason: description ? 'Matched Drive name or description' : 'Matched Drive name',
      metadata: {
        unit: '',
        lesson: '',
        packet: '',
        sourceDocument: name,
        outputType: outputType,
        targetDashboard: '',
        relatedNotionRecords: '',
        readinessStatus: '',
        description: description,
        source_system: sourceSystem,
        canonical_owner_database: '',
        canonical_record_url: '',
        duplicate_resolution_status: duplicateResolutionStatus,
        approved_readiness_vocabulary: config.readinessVocabulary || [],
        file_url: fileUrl,
        sourceSystem: sourceSystem,
        canonicalOwnerDatabase: '',
        canonicalRecordUrl: '',
        duplicateResolutionStatus: duplicateResolutionStatus,
        approvedReadinessVocabulary: config.readinessVocabulary || [],
        fileUrl: fileUrl,
        updatedAt: file.getLastUpdated().toISOString(),
        folderName: folder.getName(),
        mimeType: mimeType
      }
    };
  }

  function hasMetadataOnlyFilters_(filters) {
    return [
      APP_CONFIG.FIELDS.UNIT,
      APP_CONFIG.FIELDS.LESSON,
      APP_CONFIG.FIELDS.PACKET,
      APP_CONFIG.FIELDS.READINESS_STATUS
    ].some(function(field) {
      return Boolean(filters[field]);
    });
  }

  function safeGetDescription_(file) {
    try {
      return file.getDescription() || '';
    } catch (error) {
      return '';
    }
  }

  function mapMimeTypeToOutputType_(mimeType) {
    const mapping = {};
    mapping[MimeType.GOOGLE_DOCS] = 'source_document';
    mapping[MimeType.GOOGLE_SLIDES] = 'slide_deck';
    mapping[MimeType.GOOGLE_SHEETS] = 'dashboard_or_index';
    mapping[MimeType.PDF] = 'pdf';

    return mapping[mimeType] || 'drive_file';
  }

  return {
    search: search
  };
})();

const DriveSearchService = (function() {
  function search(normalizedQuery, filters, config) {
    if (!config.driveFolderIds.length) {
      console.warn('Drive search skipped because no Drive folder IDs are configured.');
      return [];
    }

    return config.driveFolderIds.reduce(function(results, folderId) {
      try {
        const folder = DriveApp.getFolderById(folderId);
        return results.concat(searchFolder_(folder, normalizedQuery, filters, config));
      } catch (error) {
        console.error('Drive folder search failed', {
          folderId: folderId,
          message: error.message,
          stack: error.stack
        });
        return results;
      }
    }, []);
  }

  function searchFolder_(folder, normalizedQuery, filters, config) {
    const files = folder.getFiles();
    const results = [];
    let scanned = 0;

    while (files.hasNext() && scanned < APP_CONFIG.MAX_DRIVE_FILES_PER_FOLDER) {
      const file = files.next();
      scanned += 1;

      const result = fileToResult_(file, folder);
      if (driveResultMatchesQuery_(result, normalizedQuery) && driveResultMatchesFilters_(result, filters)) {
        results.push(result);
      }
    }

    return results;
  }

  function fileToResult_(file, folder) {
    const mimeType = file.getMimeType();
    const outputType = mimeTypeToOutputType_(mimeType);

    return {
      source: 'drive',
      title: file.getName(),
      type: outputType,
      fileUrl: file.getUrl(),
      matchReason: 'Matched Drive file name or metadata',
      metadata: {
        unit: '',
        lesson: '',
        packet: '',
        sourceDocument: file.getName(),
        outputType: outputType,
        targetDashboard: '',
        relatedNotionRecords: '',
        readinessStatus: '',
        fileId: file.getId(),
        mimeType: mimeType,
        parentFolder: folder.getName(),
        updatedAt: file.getLastUpdated() ? file.getLastUpdated().toISOString() : ''
      }
    };
  }

  function driveResultMatchesQuery_(result, normalizedQuery) {
    if (!normalizedQuery) {
      return true;
    }

    return [
      result.title,
      result.type,
      result.metadata.parentFolder,
      result.metadata.mimeType
    ].some(function(value) {
      return valueMatchesQuery_(value, normalizedQuery);
    });
  }

  function driveResultMatchesFilters_(result, filters) {
    const fields = APP_CONFIG.FIELDS;

    return Object.keys(filters).every(function(field) {
      if (!filters[field]) {
        return true;
      }

      if (field === fields.OUTPUT_TYPE) {
        return filterMatchesValue_(result.metadata.outputType, filters[field]);
      }

      return false;
    });
  }

  function mimeTypeToOutputType_(mimeType) {
    const mapping = {
      'application/vnd.google-apps.document': 'google_doc',
      'application/vnd.google-apps.presentation': 'google_slides',
      'application/vnd.google-apps.spreadsheet': 'google_sheet',
      'application/pdf': 'pdf'
    };

    return mapping[mimeType] || 'drive_file';
  }

  return {
    search: search
  };
})();

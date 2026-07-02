function vamValidateMissingRequiredFields_(context) {
  const issues = [];
  context.records.forEach(function(record) {
    VAM_GOV_CONFIG.requiredFields.forEach(function(fieldName) {
      if (vamHasHeader_(context.headerMap, fieldName) && !vamClean_(record.values[fieldName])) {
        issues.push(vamIssue_(record, 'Warning', 'Missing Required Field', fieldName, 'Required field is blank.', 'Complete the field or document a blocker.', 'Metadata'));
      }
    });
  });
  return issues;
}

function vamValidateControlledValues_(context) {
  const issues = [];
  Object.keys(VAM_GOV_CONFIG.controlledValues).forEach(function(fieldName) {
    if (!vamHasHeader_(context.headerMap, fieldName)) return;
    const allowed = VAM_GOV_CONFIG.controlledValues[fieldName];
    const allowedLookup = allowed.reduce(function(map, value) {
      map[vamCompare_(value)] = true;
      return map;
    }, {});
    context.records.forEach(function(record) {
      const value = vamClean_(record.values[fieldName]);
      if (!value) return;
      const selectedValues = vamIsMultiSelectControlledField_(fieldName)
        ? vamSplitControlledValues_(value)
        : [value];
      const invalidValues = selectedValues.filter(function(selectedValue) {
        return !allowedLookup[vamCompare_(selectedValue)];
      });
      if (invalidValues.length) {
        issues.push(vamIssue_(record, 'Warning', 'Invalid Controlled Value', fieldName, 'Value is outside the controlled vocabulary: "' + invalidValues.join('; ') + '".', 'Use one of: ' + allowed.join('; '), ''));
      }
    });
  });
  return issues;
}

function vamValidateDriveFileIds_(context) {
  const issues = [];
  const linkField = VAM_GOV_CONFIG.fields.driveLink;
  const idField = VAM_GOV_CONFIG.fields.driveFileId;
  if (!vamHasHeader_(context.headerMap, linkField) || !vamHasHeader_(context.headerMap, idField)) return issues;

  context.records.forEach(function(record) {
    const driveLink = vamClean_(record.values[linkField]);
    const currentId = vamClean_(record.values[idField]);
    const parsedId = vamExtractDriveFileId_(driveLink);
    if (!driveLink || !parsedId) return;
    if (!currentId) {
      issues.push(vamIssue_(record, 'Info', 'Drive File ID Suggestion', idField, 'Drive Link contains a parseable file ID, but Drive File ID is blank.', parsedId, 'Drive Upload'));
    } else if (currentId !== parsedId) {
      issues.push(vamIssue_(record, 'Warning', 'Drive File ID Mismatch', idField, 'Drive File ID does not match the ID parsed from Drive Link.', 'Review exact file mapping. Parsed ID: ' + parsedId, 'Drive Upload'));
    }
  });
  return issues;
}

function vamValidateCanonicalFilenames_(context) {
  const issues = [];
  const originalField = VAM_GOV_CONFIG.fields.originalFilename;
  const canonicalField = VAM_GOV_CONFIG.fields.canonicalFilename;
  if (!vamHasHeader_(context.headerMap, originalField) || !vamHasHeader_(context.headerMap, canonicalField)) return issues;

  context.records.forEach(function(record) {
    const original = vamClean_(record.values[originalField]);
    const canonical = vamClean_(record.values[canonicalField]);
    const suggestion = vamSuggestCanonicalFilename_(original);
    if (original && !canonical && suggestion) {
      issues.push(vamIssue_(record, 'Info', 'Canonical Filename Suggestion', canonicalField, 'Canonical Filename is blank and can be derived from Original Filename.', suggestion, 'Metadata'));
    }
  });
  return issues;
}

function vamValidateDuplicateAssetIds_(context) {
  const issues = [];
  const fieldName = VAM_GOV_CONFIG.fields.assetId;
  if (!vamHasHeader_(context.headerMap, fieldName)) return issues;

  const groups = {};
  context.records.forEach(function(record) {
    const assetId = vamClean_(record.values[fieldName]);
    if (!assetId) return;
    const key = vamCompare_(assetId);
    groups[key] = groups[key] || { assetId: assetId, records: [] };
    groups[key].records.push(record);
  });

  Object.keys(groups).forEach(function(key) {
    const group = groups[key];
    if (group.records.length < 2) return;
    const rows = group.records.map(function(record) { return record.rowNumber; }).join(', ');
    group.records.forEach(function(record) {
      issues.push(vamIssue_(record, 'Warning', 'Duplicate Asset ID', fieldName, 'Asset ID appears on multiple rows: ' + rows + '.', 'Resolve duplicate identity or document duplicate relationship before advancing.', 'Metadata'));
    });
  });
  return issues;
}

function vamValidateWorkflowStages_(context) {
  const issues = [];
  const nextStepField = VAM_GOV_CONFIG.fields.nextWorkflowStep;
  if (!vamHasHeader_(context.headerMap, nextStepField)) return issues;

  context.records.forEach(function(record) {
    const nextStep = vamClean_(record.values[nextStepField]);
    if (!nextStep) return;
    const blockers = [];
    VAM_GOV_CONFIG.workflowStages.forEach(function(stage) {
      const applies = stage.nextSteps.some(function(step) { return vamCompare_(step) === vamCompare_(nextStep); });
      if (!applies) return;
      const missing = stage.requiredFields.filter(function(fieldName) {
        return vamHasHeader_(context.headerMap, fieldName) && !vamClean_(record.values[fieldName]);
      });
      if (missing.length) {
        blockers.push({
          stage: stage,
          missingFields: missing
        });
      }
    });
    if (blockers.length) {
      issues.push(vamIssue_(
        record,
        'Warning',
        'Blocked From Advancing',
        nextStepField,
        'Row is marked for "' + nextStep + '" but is missing stage fields: ' + vamFormatWorkflowBlockerFields_(blockers) + '.',
        blockers.map(function(blocker) {
          return blocker.stage.name + ': ' + blocker.stage.blocker;
        }).join(' | '),
        blockers.map(function(blocker) {
          return blocker.stage.name;
        }).join('; ')
      ));
    }
  });
  return issues;
}

function vamFormatWorkflowBlockerFields_(blockers) {
  return blockers.map(function(blocker) {
    return blocker.stage.name + ': ' + blocker.missingFields.join(', ');
  }).join(' | ');
}

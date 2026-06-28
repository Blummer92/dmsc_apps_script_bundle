var GovernanceService = (function() {
  function enrichRecords(metadataRecords, sourceRecords) {
    const records = metadataRecords || [];
    const sourceLookup = buildSourceLookup_(sourceRecords || []);
    const duplicateGroups = buildDuplicateGroups(records);
    const rowToDuplicate = {};

    duplicateGroups.forEach(function(group) {
      group.records.forEach(function(record) {
        rowToDuplicate[record.rowNumber] = group.duplicateKey;
      });
    });

    return records.map(function(record) {
      const sourceApproval = buildSourceApproval_(record, sourceLookup);
      const tier = normalizeTier_(record.review_tier);
      const warnings = buildWarnings_(record, tier, sourceApproval);
      const duplicateKey = rowToDuplicate[record.rowNumber] || '';
      const unresolvedDuplicate = Boolean(duplicateKey) && normalize_(record.duplicate_resolution_status) !== 'resolved';
      const evidenceExists = Boolean(sourceApproval.approvalEvidenceUrl);
      const sourceApproved = normalize_(sourceApproval.approvalStatus) === 'approved';
      const approvedPromptExists = Boolean(record.approved_prompt);
      const hasBlocker = warnings.some(function(warning) { return warning.severity === 'blocker'; });
      const blocked = !tier || tier === 'Tier 4' || hasBlocker || unresolvedDuplicate;
      const computedExportEligible = tier === 'Tier 3' && sourceApproved && evidenceExists && !blocked;
      const computedGenerationEligible = computedExportEligible && approvedPromptExists && !unresolvedDuplicate;
      const statusModel = buildStatusModel_(
        record,
        tier,
        warnings,
        unresolvedDuplicate,
        sourceApproval,
        computedExportEligible,
        computedGenerationEligible,
        blocked
      );

      return {
        rawData: record,
        rowNumber: record.rowNumber,
        fileName: record.file_name || record.filename || record.name || '',
        fileId: record.file_id || '',
        driveUrl: record.drive_url || '',
        fullPath: record.full_path || '',
        folderLevels: [record.level_1_folder || '', record.level_2_folder || '', record.level_3_folder || ''].filter(Boolean),
        reviewTier: tier || 'Invalid Tier',
        reviewTierReason: record.review_tier_reason || '',
        validationWarnings: warnings,
        duplicateCandidateKey: duplicateKey,
        unresolvedDuplicate: unresolvedDuplicate,
        blocked: blocked,
        blockedReason: buildBlockedReason_(tier, warnings, unresolvedDuplicate),
        workflowStatus: statusModel.workflowStatus,
        productionStatus: statusModel.productionStatus,
        nextAction: statusModel.nextAction,
        hardBlocker: statusModel.hardBlocker,
        whyProductionBlocked: statusModel.whyProductionBlocked,
        permissionGrid: statusModel.permissionGrid,
        computedExportEligible: computedExportEligible,
        computedGenerationEligible: computedGenerationEligible,
        sourceApproval: sourceApproval,
        prompts: {
          gemini: record.gemini_guessed_prompt || '',
          openai: record.openai_guessed_prompt || '',
          copilot: record.copilot_prompt_guess || '',
          original: record.original_image_prompt || '',
          proposedCleaned: record.proposed_cleaned_prompt || '',
          approved: record.approved_prompt || ''
        },
        metadata: {
          assetLabel: record.asset_label || '',
          assetCategory: record.asset_category || '',
          unitVisualSystem: record.unit_visual_system || '',
          sourceSystem: record.source_system || 'Google Drive',
          agentNotes: record.agent_notes || ''
        },
        governance: {
          readOnly: true,
          duplicateGroupingOnly: true,
          promptFieldsAreProposalsOnly: true,
          manualPromotionAllowed: false
        }
      };
    });
  }

  function summarize(records, duplicateGroups, warnings, config) {
    const tierCounts = { tier1: 0, tier2: 0, tier3: 0, tier4: 0, invalid: 0 };
    let missingMetadataCount = 0;
    let blockedCount = 0;
    let exportEligibleCount = 0;
    let generationEligibleCount = 0;
    const workflowCounts = {
      reviewableRecords: 0,
      needsMetadataCleanup: 0,
      referenceCandidates: 0,
      needsSourceApproval: 0,
      productionBlocked: 0,
      hardBlocked: 0
    };

    (records || []).forEach(function(record) {
      if (record.reviewTier === 'Tier 1') tierCounts.tier1 += 1;
      else if (record.reviewTier === 'Tier 2') tierCounts.tier2 += 1;
      else if (record.reviewTier === 'Tier 3') tierCounts.tier3 += 1;
      else if (record.reviewTier === 'Tier 4') tierCounts.tier4 += 1;
      else tierCounts.invalid += 1;
      if (record.validationWarnings.length) missingMetadataCount += 1;
      if (record.blocked) blockedCount += 1;
      if (record.computedExportEligible) exportEligibleCount += 1;
      if (record.computedGenerationEligible) generationEligibleCount += 1;
      if (record.workflowStatus === 'Reviewable records') workflowCounts.reviewableRecords += 1;
      if (record.workflowStatus === 'Needs metadata cleanup') workflowCounts.needsMetadataCleanup += 1;
      if (record.workflowStatus === 'Reference candidates') workflowCounts.referenceCandidates += 1;
      if (record.workflowStatus === 'Needs source approval') workflowCounts.needsSourceApproval += 1;
      if (record.productionStatus === 'Production blocked') workflowCounts.productionBlocked += 1;
      if (record.productionStatus === 'Hard blocked') workflowCounts.hardBlocked += 1;
    });

    return {
      connectedSheetName: config.metadataSheetName,
      totalRecords: records.length,
      warnings: warnings || [],
      readOnly: true,
      tierCounts: tierCounts,
      missingMetadataCount: missingMetadataCount,
      duplicateCandidateCount: duplicateGroups.reduce(function(total, group) { return total + group.count; }, 0),
      duplicateGroupCount: duplicateGroups.length,
      blockedCount: blockedCount,
      workflowCounts: workflowCounts,
      exportEligibleCount: exportEligibleCount,
      generationEligibleCount: generationEligibleCount,
      lastScanPreviewAt: new Date().toISOString()
    };
  }

  function buildDuplicateGroups(records) {
    const buckets = {};
    (records || []).forEach(function(record) {
      candidateKeys_(record).forEach(function(key) {
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(record);
      });
    });
    return Object.keys(buckets).filter(function(key) { return buckets[key].length > 1; }).map(function(key) {
      return {
        duplicateKey: key,
        count: buckets[key].length,
        records: buckets[key].map(function(record) {
          return { rowNumber: record.rowNumber, fileName: record.file_name || '', fileId: record.file_id || '', driveUrl: record.drive_url || '', reviewTier: record.review_tier || '' };
        }),
        mergePerformed: false,
        resolutionStatus: 'review_required'
      };
    });
  }

  function buildSourceLookup_(sourceRecords) {
    const lookup = {};
    (sourceRecords || []).forEach(function(record) {
      stableKeys_(record).forEach(function(key) {
        if (!lookup[key]) {
          lookup[key] = record;
        }
      });
    });
    return lookup;
  }

  function buildSourceApproval_(metadataRecord, sourceLookup) {
    const matchedSource = findMatchedSource_(metadataRecord, sourceLookup);

    return {
      recordId: firstValue_([
        metadataRecord.dm_source_library_record_id,
        matchedSource.dm_source_library_record_id,
        matchedSource.source_record_id,
        matchedSource.record_id,
        matchedSource.id
      ]),
      url: firstValue_([
        metadataRecord.dm_source_library_url,
        matchedSource.dm_source_library_url,
        matchedSource.source_url,
        matchedSource.canonical_record_url,
        matchedSource.url
      ]),
      approvalStatus: firstValue_([
        metadataRecord.source_approval_status,
        matchedSource.source_approval_status,
        matchedSource.approval_status,
        matchedSource.status
      ]),
      approvalEvidenceUrl: firstValue_([
        metadataRecord.source_approval_evidence_url,
        matchedSource.source_approval_evidence_url,
        matchedSource.approval_evidence_url,
        matchedSource.evidence_url,
        matchedSource.approval_url
      ]),
      approvedBy: firstValue_([
        metadataRecord.source_approved_by,
        matchedSource.source_approved_by,
        matchedSource.approved_by
      ]),
      approvedAt: firstValue_([
        metadataRecord.source_approved_at,
        matchedSource.source_approved_at,
        matchedSource.approved_at
      ]),
      restrictions: firstValue_([
        metadataRecord.source_restrictions,
        matchedSource.source_restrictions,
        matchedSource.restrictions,
        matchedSource.usage_restrictions
      ]),
      matchedFromSourceLibrary: Object.keys(matchedSource).length > 0
    };
  }

  function findMatchedSource_(metadataRecord, sourceLookup) {
    const keys = stableKeys_(metadataRecord);
    for (let i = 0; i < keys.length; i += 1) {
      if (sourceLookup[keys[i]]) {
        return sourceLookup[keys[i]];
      }
    }
    return {};
  }

  function buildWarnings_(record, tier, sourceApproval) {
    const warnings = [];
    if (!record.file_id) warnings.push({ message: 'Missing File ID', severity: 'blocker' });
    if (!record.drive_url) warnings.push({ message: 'Missing Drive URL', severity: 'blocker' });
    if (!record.full_path) warnings.push({ message: 'Missing Full Path', severity: 'warning' });
    if (!tier) warnings.push({ message: 'Each record must have exactly one Review Tier.', severity: 'blocker' });
    if (tier === 'Tier 1') warnings.push({ message: 'Tier 1 is searchable/reviewable only and never exportable.', severity: 'info' });
    if (tier === 'Tier 2') warnings.push({ message: 'Tier 2 is reference-only and never generation eligible.', severity: 'info' });
    if (tier === 'Tier 3' && !sourceApproval.approvalEvidenceUrl) warnings.push({ message: 'Tier 3 requires approval evidence before export/generation.', severity: 'blocker' });
    if (tier === 'Tier 4') warnings.push({ message: 'Tier 4 is audit-visible only and always blocked.', severity: 'blocker' });
    if (!record.gemini_guessed_prompt && !record.openai_guessed_prompt && !record.copilot_prompt_guess && !record.original_image_prompt) warnings.push({ message: 'All prompt fields are blank.', severity: 'warning' });
    return warnings;
  }

  function buildBlockedReason_(tier, warnings, unresolvedDuplicate) {
    const reasons = warnings.filter(function(warning) { return warning.severity === 'blocker'; }).map(function(warning) { return warning.message; });
    if (unresolvedDuplicate) reasons.push('Unresolved duplicate candidate.');
    if (tier === 'Tier 1') reasons.push('Tier 1 records are never exportable.');
    if (tier === 'Tier 2') reasons.push('Tier 2 records are reference-only.');
    return reasons.join(' ');
  }

  function buildStatusModel_(record, tier, warnings, unresolvedDuplicate, sourceApproval, computedExportEligible, computedGenerationEligible, blocked) {
    const blockerMessages = warnings
      .filter(function(warning) { return warning.severity === 'blocker'; })
      .map(function(warning) { return warning.message; });
    const hasMissingRequiredMetadata = warnings.some(function(warning) {
      return ['Missing File ID', 'Missing Drive URL', 'Each record must have exactly one Review Tier.'].indexOf(warning.message) !== -1;
    });
    const needsSourceApproval = tier === 'Tier 3' && !sourceApproval.approvalEvidenceUrl;
    const hardBlocker = tier === 'Tier 4' || !tier || hasMissingRequiredMetadata;
    let workflowStatus = 'Reviewable records';
    let productionStatus = computedExportEligible ? 'Production ready candidate' : 'Production blocked';
    let nextAction = 'Review metadata and prompt proposal.';

    if (hardBlocker) {
      workflowStatus = 'Hard blocked';
      productionStatus = 'Hard blocked';
      nextAction = tier === 'Tier 4'
        ? 'Keep audit-visible only; do not export or generate.'
        : 'Fix required metadata before review can continue.';
    } else if (hasMissingRequiredMetadata || warnings.some(function(w) { return w.message.indexOf('Missing') === 0; })) {
      workflowStatus = 'Needs metadata cleanup';
      nextAction = 'Complete missing metadata fields in the governed source workflow.';
    } else if (tier === 'Tier 2') {
      workflowStatus = 'Reference candidates';
      productionStatus = 'Reference only';
      nextAction = 'Use internally as reference only; do not generate.';
    } else if (needsSourceApproval) {
      workflowStatus = 'Needs source approval';
      nextAction = 'Prepare source approval evidence in DM Source Library.';
    } else if (unresolvedDuplicate) {
      workflowStatus = 'Duplicate review';
      nextAction = 'Review duplicate candidate group; do not merge automatically.';
    } else if (computedGenerationEligible) {
      workflowStatus = 'Reviewable records';
      productionStatus = 'Generation eligible candidate';
      nextAction = 'Ready for manual governance handoff review.';
    } else if (computedExportEligible) {
      workflowStatus = 'Reviewable records';
      productionStatus = 'Export eligible candidate';
      nextAction = 'Review Approved Prompt before generation use.';
    }

    return {
      workflowStatus: workflowStatus,
      productionStatus: productionStatus,
      nextAction: nextAction,
      hardBlocker: hardBlocker,
      whyProductionBlocked: buildWhyBlocked_(productionStatus, blockerMessages, unresolvedDuplicate, needsSourceApproval, record),
      permissionGrid: buildPermissionGrid_(tier, hasMissingRequiredMetadata, needsSourceApproval, unresolvedDuplicate, computedExportEligible, computedGenerationEligible, hardBlocker)
    };
  }

  function buildWhyBlocked_(productionStatus, blockerMessages, unresolvedDuplicate, needsSourceApproval, record) {
    const reasons = blockerMessages.slice();
    if (unresolvedDuplicate) reasons.push('Unresolved duplicate candidate.');
    if (needsSourceApproval) reasons.push('DM Source Library approval evidence is missing.');
    if (!record.approved_prompt) reasons.push('Approved Prompt is missing for prompt-based generation.');
    if (productionStatus === 'Reference only') reasons.push('Tier 2 is internal reference only.');
    return reasons.join(' ') || 'Not blocked for the current computed workflow.';
  }

  function buildPermissionGrid_(tier, hasMissingRequiredMetadata, needsSourceApproval, unresolvedDuplicate, computedExportEligible, computedGenerationEligible, hardBlocker) {
    return {
      searchPreview: hardBlocker && tier !== 'Tier 4' ? 'Candidate' : 'Allowed',
      metadataCleanup: hasMissingRequiredMetadata ? 'Owner Required' : 'Candidate',
      internalReference: tier === 'Tier 2' ? 'Allowed' : 'Candidate',
      export: computedExportEligible ? 'Candidate' : 'Blocked',
      generation: computedGenerationEligible ? 'Candidate' : 'Blocked',
      sourceApproval: needsSourceApproval ? 'Owner Required' : 'Blocked'
    };
  }

  function candidateKeys_(record) {
    const keys = [];
    if (record.file_id) keys.push('file_id:' + normalize_(record.file_id));
    if (record.drive_url) keys.push('drive_url:' + normalize_(record.drive_url));
    if (record.dm_source_library_record_id) keys.push('source_record:' + normalize_(record.dm_source_library_record_id));
    if (record.canonical_record_url) keys.push('canonical_record_url:' + normalize_(record.canonical_record_url));
    const metadataKey = [record.file_name, record.full_path].map(normalize_).filter(Boolean).join('|');
    if (metadataKey) keys.push('metadata:' + metadataKey);
    return keys;
  }

  function stableKeys_(record) {
    return [
      ['source_record', record.dm_source_library_record_id || record.source_record_id || record.record_id || record.id],
      ['source_url', record.dm_source_library_url],
      ['file_id', record.file_id],
      ['drive_url', record.drive_url],
      ['source_url', record.source_url],
      ['canonical_record_url', record.canonical_record_url],
      ['canonical_record_url', record.url]
    ].filter(function(pair) {
      return pair[1];
    }).map(function(pair) {
      return pair[0] + ':' + normalize_(pair[1]);
    });
  }

  function normalizeTier_(value) {
    const n = normalize_(value);
    if (['1', 'tier 1', 'tier_1'].indexOf(n) !== -1) return 'Tier 1';
    if (['2', 'tier 2', 'tier_2'].indexOf(n) !== -1) return 'Tier 2';
    if (['3', 'tier 3', 'tier_3'].indexOf(n) !== -1) return 'Tier 3';
    if (['4', 'tier 4', 'tier_4'].indexOf(n) !== -1) return 'Tier 4';
    return '';
  }

  function firstValue_(values) {
    for (let i = 0; i < values.length; i += 1) {
      if (values[i]) {
        return values[i];
      }
    }
    return '';
  }

  function normalize_(value) { return String(value || '').toLowerCase().trim(); }
  return { enrichRecords: enrichRecords, summarize: summarize, buildDuplicateGroups: buildDuplicateGroups };
})();

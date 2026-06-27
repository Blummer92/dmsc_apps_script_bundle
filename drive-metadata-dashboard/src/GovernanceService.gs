var GovernanceService = (function() {
  function enrichRecords(records) {
    const duplicateGroups = buildDuplicateGroups(records || []);
    const rowToDuplicate = {};
    duplicateGroups.forEach(function(group) {
      group.records.forEach(function(record) {
        rowToDuplicate[record.rowNumber] = group.duplicateKey;
      });
    });

    return (records || []).map(function(record) {
      const tier = normalizeTier_(record.review_tier);
      const warnings = buildWarnings_(record, tier);
      const duplicateKey = rowToDuplicate[record.rowNumber] || '';
      const unresolvedDuplicate = Boolean(duplicateKey) && normalize_(record.duplicate_resolution_status) !== 'resolved';
      const evidenceExists = Boolean(record.source_approval_evidence_url);
      const sourceApproved = normalize_(record.source_approval_status) === 'approved';
      const approvedPromptExists = Boolean(record.approved_prompt);
      const hasBlocker = warnings.some(function(warning) { return warning.severity === 'blocker'; });
      const blocked = !tier || tier === 'Tier 4' || hasBlocker || unresolvedDuplicate;
      const computedExportEligible = tier === 'Tier 3' && sourceApproved && evidenceExists && !blocked;
      const computedGenerationEligible = computedExportEligible && approvedPromptExists && !unresolvedDuplicate;

      return {
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
        computedExportEligible: computedExportEligible,
        computedGenerationEligible: computedGenerationEligible,
        sourceApproval: {
          recordId: record.dm_source_library_record_id || '',
          url: record.dm_source_library_url || '',
          approvalStatus: record.source_approval_status || '',
          approvalEvidenceUrl: record.source_approval_evidence_url || '',
          approvedBy: record.source_approved_by || '',
          approvedAt: record.source_approved_at || '',
          restrictions: record.source_restrictions || ''
        },
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

  function buildWarnings_(record, tier) {
    const warnings = [];
    if (!record.file_id) warnings.push({ message: 'Missing File ID', severity: 'blocker' });
    if (!record.drive_url) warnings.push({ message: 'Missing Drive URL', severity: 'blocker' });
    if (!record.full_path) warnings.push({ message: 'Missing Full Path', severity: 'warning' });
    if (!tier) warnings.push({ message: 'Each record must have exactly one Review Tier.', severity: 'blocker' });
    if (tier === 'Tier 1') warnings.push({ message: 'Tier 1 is searchable/reviewable only and never exportable.', severity: 'info' });
    if (tier === 'Tier 2') warnings.push({ message: 'Tier 2 is reference-only and never generation eligible.', severity: 'info' });
    if (tier === 'Tier 3' && !record.source_approval_evidence_url) warnings.push({ message: 'Tier 3 requires approval evidence before export/generation.', severity: 'blocker' });
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

  function candidateKeys_(record) {
    const keys = [];
    if (record.file_id) keys.push('file_id:' + normalize_(record.file_id));
    if (record.drive_url) keys.push('drive_url:' + normalize_(record.drive_url));
    if (record.dm_source_library_record_id) keys.push('source_record:' + normalize_(record.dm_source_library_record_id));
    const metadataKey = [record.file_name, record.full_path].map(normalize_).filter(Boolean).join('|');
    if (metadataKey) keys.push('metadata:' + metadataKey);
    return keys;
  }

  function normalizeTier_(value) {
    const n = normalize_(value);
    if (['1', 'tier 1', 'tier_1'].indexOf(n) !== -1) return 'Tier 1';
    if (['2', 'tier 2', 'tier_2'].indexOf(n) !== -1) return 'Tier 2';
    if (['3', 'tier 3', 'tier_3'].indexOf(n) !== -1) return 'Tier 3';
    if (['4', 'tier 4', 'tier_4'].indexOf(n) !== -1) return 'Tier 4';
    return '';
  }

  function normalize_(value) { return String(value || '').toLowerCase().trim(); }
  return { enrichRecords: enrichRecords, summarize: summarize, buildDuplicateGroups: buildDuplicateGroups };
})();

/**
 * Integration: Filter by Queue → Calculate Summary
 * Tests how queue filtering leads to summary metric generation
 */

describe('Integration: Filter by Queue → Summary', () => {
  function matchesQueue_(record, queueId) {
    if (queueId === 'all') return true;
    if (queueId === 'noPrompt') {
      return String(record['Prompt Evidence Status'] || '').trim() === 'No Prompt Evidence';
    }
    if (queueId === 'duplicateCandidates') {
      return String(record['Duplicate Group'] || '').trim() !== '';
    }
    if (queueId === 'sourceClearance') {
      return String(record['Source Verification Status'] || '').trim() === 'Needed';
    }
    if (queueId === 'visualReview') {
      return String(record['Next Owner'] || '').trim() === 'Visual Asset Director';
    }
    return false;
  }

  function getDmscDashboardSummary(rows) {
    const summary = {
      totalRecords: rows.length,
      humanReviewRequired: 0,
      sourceClearanceNeeded: 0,
      noPromptEvidence: 0,
      duplicateGroups: 0,
      missingDriveIdentity: 0,
      visualAssetReview: 0,
      instructionalBlocked: 0,
      strongEvidence: 0,
      lastSync: ''
    };

    const duplicateGroups = {};
    rows.forEach((record) => {
      if (String(record['Human Review Required'] || '').trim() === 'Yes') summary.humanReviewRequired++;
      if (String(record['Source Verification Status'] || '').trim() === 'Needed') summary.sourceClearanceNeeded++;
      if (String(record['Prompt Evidence Status'] || '').trim() === 'No Prompt Evidence') summary.noPromptEvidence++;
      if (String(record['Next Owner'] || '').trim() === 'Visual Asset Director') summary.visualAssetReview++;
      if (String(record['Instructional Blocked'] || '').trim() === 'Yes') summary.instructionalBlocked++;
      if (String(record['Strong Evidence'] || '').trim() === 'Yes') summary.strongEvidence++;
      if (!String(record['File ID'] || '').trim()) summary.missingDriveIdentity++;

      const dup = String(record['Duplicate Group'] || '').trim();
      if (dup) duplicateGroups[dup] = true;

      const sync = String(record['Last Metadata Sync Timestamp'] || '').trim();
      if (sync && (!summary.lastSync || sync > summary.lastSync)) summary.lastSync = sync;
    });

    summary.duplicateGroups = Object.keys(duplicateGroups).length;
    return summary;
  }

  const records = Array.from({ length: 40 }, (_, i) => ({
    'File ID': i % 5 === 0 ? '' : `file-${i}`,
    'Prompt Evidence Status': ['No Prompt Evidence', 'Strong Evidence'][i % 2],
    'Source Verification Status': ['Needed', 'Verified'][i % 3],
    'Next Owner': ['Visual Asset Director', 'Content Team'][i % 4],
    'Human Review Required': ['Yes', 'No'][i % 2],
    'Duplicate Group': i % 7 === 0 ? `group-${Math.floor(i / 7)}` : '',
    'Instructional Blocked': ['Yes', 'No'][i % 3],
    'Strong Evidence': ['Yes', 'No'][i % 5],
    'Last Metadata Sync Timestamp': `2024-01-${(i % 28) + 1}T10:00:00Z`
  }));

  describe('Queue filtering produces meaningful summaries', () => {
    test('no-prompt queue summary', () => {
      const filtered = records.filter(r => matchesQueue_(r, 'noPrompt'));
      const summary = getDmscDashboardSummary(filtered);

      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every(r => String(r['Prompt Evidence Status'] || '').trim() === 'No Prompt Evidence')).toBe(true);
      expect(summary.totalRecords).toBe(filtered.length);
      expect(summary.noPromptEvidence).toBe(filtered.length);
    });

    test('duplicate-candidates queue summary', () => {
      const filtered = records.filter(r => matchesQueue_(r, 'duplicateCandidates'));
      const summary = getDmscDashboardSummary(filtered);

      expect(filtered.every(r => String(r['Duplicate Group'] || '').trim() !== '')).toBe(true);
      expect(summary.duplicateGroups).toBeGreaterThan(0);
    });

    test('source-clearance queue summary', () => {
      const filtered = records.filter(r => matchesQueue_(r, 'sourceClearance'));
      const summary = getDmscDashboardSummary(filtered);

      expect(filtered.every(r => String(r['Source Verification Status'] || '').trim() === 'Needed')).toBe(true);
      expect(summary.sourceClearanceNeeded).toBe(filtered.length);
    });

    test('visual-review queue summary', () => {
      const filtered = records.filter(r => matchesQueue_(r, 'visualReview'));
      const summary = getDmscDashboardSummary(filtered);

      expect(filtered.every(r => String(r['Next Owner'] || '').trim() === 'Visual Asset Director')).toBe(true);
      expect(summary.visualAssetReview).toBe(filtered.length);
    });
  });

  describe('Summary aggregates across queue boundaries', () => {
    test('full dataset summary includes all queues', () => {
      const fullSummary = getDmscDashboardSummary(records);

      const noPromptFiltered = records.filter(r => matchesQueue_(r, 'noPrompt'));
      const noPromptSummary = getDmscDashboardSummary(noPromptFiltered);

      expect(fullSummary.totalRecords).toBe(records.length);
      expect(fullSummary.noPromptEvidence).toBeGreaterThanOrEqual(noPromptSummary.noPromptEvidence);
    });

    test('summary metrics are independent', () => {
      const summary = getDmscDashboardSummary(records);

      expect(summary.totalRecords).toBe(records.length);
      expect(summary.missingDriveIdentity).toBeGreaterThan(0);
      expect(summary.noPromptEvidence).toBeGreaterThan(0);
      expect(summary.sourceClearanceNeeded).toBeGreaterThan(0);
    });
  });

  describe('Queue filtering affects summary metrics correctly', () => {
    test('filtering removes records, summary updates accordingly', () => {
      const fullSummary = getDmscDashboardSummary(records);
      const filtered = records.filter(r => String(r['Human Review Required'] || '').trim() === 'Yes');
      const filteredSummary = getDmscDashboardSummary(filtered);

      expect(filteredSummary.totalRecords).toBeLessThanOrEqual(fullSummary.totalRecords);
      expect(filteredSummary.humanReviewRequired).toBe(filteredSummary.totalRecords);
    });

    test('filtered summary has lower missing identity count if all have File IDs', () => {
      const withFileIds = records.filter(r => String(r['File ID'] || '').trim() !== '');
      const summary = getDmscDashboardSummary(withFileIds);

      expect(summary.missingDriveIdentity).toBe(0);
    });
  });

  describe('Real-world scenario: dashboard shows queue and summary together', () => {
    test('user views noPrompt queue and sees accurate summary', () => {
      const queueId = 'noPrompt';
      const filtered = records.filter(r => matchesQueue_(r, queueId));
      const summary = getDmscDashboardSummary(filtered);

      expect(summary.totalRecords).toBe(filtered.length);
      expect(summary.noPromptEvidence).toBe(filtered.length);
      expect(summary.lastSync).not.toBe('');
    });

    test('switching between queues recalculates summary', () => {
      const noPromptFiltered = records.filter(r => matchesQueue_(r, 'noPrompt'));
      const noPromptSummary = getDmscDashboardSummary(noPromptFiltered);

      const duplicateFiltered = records.filter(r => matchesQueue_(r, 'duplicateCandidates'));
      const duplicateSummary = getDmscDashboardSummary(duplicateFiltered);

      expect(noPromptSummary.totalRecords).not.toEqual(duplicateSummary.totalRecords);
      expect(noPromptSummary.noPromptEvidence).toBeGreaterThan(duplicateSummary.noPromptEvidence);
    });
  });
});

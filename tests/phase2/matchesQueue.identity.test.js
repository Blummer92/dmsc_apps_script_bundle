/**
 * Queue filtering: Identity & metadata queues
 * Tests: Missing Drive Identity, No Prompt, Duplicate Candidates, Gemini Candidates
 */

describe('matchesQueue_() - Identity & Metadata', () => {
  function matchesQueue_(record, queueId) {
    if (queueId === 'missingIdentity') return !record.fileId && !record.driveUrl;
    if (queueId === 'noPrompt') return record.promptEvidenceStatus === 'No Prompt Evidence';
    if (queueId === 'duplicateCandidates') return Boolean(String(record.duplicateCandidateGroup || '').trim());
    if (queueId === 'geminiCandidates') return Boolean(record.geminiMetadata);
    return false;
  }

  describe('Queue: "missingIdentity"', () => {
    test('matches record with no fileId and no driveUrl', () => {
      expect(matchesQueue_({ fileId: '', driveUrl: '' }, 'missingIdentity')).toBe(true);
    });

    test('matches with null values', () => {
      expect(matchesQueue_({ fileId: null, driveUrl: null }, 'missingIdentity')).toBe(true);
    });

    test('does not match with fileId', () => {
      expect(matchesQueue_({ fileId: 'file-123', driveUrl: '' }, 'missingIdentity')).toBe(false);
    });

    test('does not match with driveUrl', () => {
      expect(matchesQueue_({ fileId: '', driveUrl: 'https://drive.google.com/...' }, 'missingIdentity')).toBe(false);
    });
  });

  describe('Queue: "noPrompt"', () => {
    test('matches No Prompt Evidence status', () => {
      expect(matchesQueue_({ promptEvidenceStatus: 'No Prompt Evidence' }, 'noPrompt')).toBe(true);
    });

    test('does not match Strong Evidence', () => {
      expect(matchesQueue_({ promptEvidenceStatus: 'Strong Evidence' }, 'noPrompt')).toBe(false);
    });

    test('does not match Weak Evidence', () => {
      expect(matchesQueue_({ promptEvidenceStatus: 'Weak Evidence' }, 'noPrompt')).toBe(false);
    });

    test('does not match null status', () => {
      expect(matchesQueue_({ promptEvidenceStatus: null }, 'noPrompt')).toBe(false);
    });
  });

  describe('Queue: "duplicateCandidates"', () => {
    test('matches non-empty duplicate group', () => {
      expect(matchesQueue_({ duplicateCandidateGroup: 'group-001' }, 'duplicateCandidates')).toBe(true);
    });

    test('matches whitespace-padded group', () => {
      expect(matchesQueue_({ duplicateCandidateGroup: '  group-001  ' }, 'duplicateCandidates')).toBe(true);
    });

    test('does not match empty group', () => {
      expect(matchesQueue_({ duplicateCandidateGroup: '' }, 'duplicateCandidates')).toBe(false);
    });

    test('does not match whitespace-only', () => {
      expect(matchesQueue_({ duplicateCandidateGroup: '   ' }, 'duplicateCandidates')).toBe(false);
    });
  });

  describe('Queue: "geminiCandidates"', () => {
    test('matches with Gemini metadata object', () => {
      expect(matchesQueue_({ geminiMetadata: { model: 'gemini-pro' } }, 'geminiCandidates')).toBe(true);
    });

    test('matches with non-empty gemini data', () => {
      expect(matchesQueue_({ geminiMetadata: 'some-data' }, 'geminiCandidates')).toBe(true);
    });

    test('does not match null metadata', () => {
      expect(matchesQueue_({ geminiMetadata: null }, 'geminiCandidates')).toBe(false);
    });

    test('does not match empty string', () => {
      expect(matchesQueue_({ geminiMetadata: '' }, 'geminiCandidates')).toBe(false);
    });
  });
});

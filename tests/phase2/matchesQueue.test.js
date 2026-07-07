/**
 * Unit tests for matchesQueue_() function
 * HIGH PRIORITY: Queue membership logic determines record visibility
 * Tests all 10 queue types with various record states
 */

describe('matchesQueue_()', () => {
  // Implementation under test
  function matchesQueue_(record, queueId) {
    if (queueId === 'all') return true;
    if (queueId === 'missingIdentity') return !record.fileId && !record.driveUrl;
    if (queueId === 'noPrompt') return record.promptEvidenceStatus === 'No Prompt Evidence';
    if (queueId === 'duplicateCandidates') return Boolean(String(record.duplicateCandidateGroup || '').trim());
    if (queueId === 'sourceClearanceNeeded') return record.sourceControlClearanceNeeded === 'Yes';
    if (queueId === 'safeForSourceReview') return record.sourceVerificationStatus === 'Verified' && record.sourceControlClearanceNeeded !== 'Yes';
    if (queueId === 'visualReview') return record.nextOwner === 'Visual Asset Director';
    if (queueId === 'instructionalBlocked') return record.instructionalBlocked === 'Yes';
    if (queueId === 'geminiCandidates') return Boolean(record.geminiMetadata);
    if (queueId === 'strongEvidence') return record.strongMetadataEvidence === 'Yes' && record.humanReviewRequired !== 'Yes';
    return false;
  }

  describe('Queue: "all" - All records', () => {
    test('matches any record', () => {
      const record = { id: '1', status: 'any' };
      expect(matchesQueue_(record, 'all')).toBe(true);
    });

    test('matches empty record', () => {
      expect(matchesQueue_({}, 'all')).toBe(true);
    });

    test('matches null record fields', () => {
      const record = { fileId: null, promptEvidenceStatus: null };
      expect(matchesQueue_(record, 'all')).toBe(true);
    });
  });

  describe('Queue: "missingIdentity" - Missing Drive Identity', () => {
    test('matches record with no fileId and no driveUrl', () => {
      const record = { fileId: '', driveUrl: '' };
      expect(matchesQueue_(record, 'missingIdentity')).toBe(true);
    });

    test('matches record with null fileId and null driveUrl', () => {
      const record = { fileId: null, driveUrl: null };
      expect(matchesQueue_(record, 'missingIdentity')).toBe(true);
    });

    test('does not match record with fileId', () => {
      const record = { fileId: 'file-123', driveUrl: '' };
      expect(matchesQueue_(record, 'missingIdentity')).toBe(false);
    });

    test('does not match record with driveUrl', () => {
      const record = { fileId: '', driveUrl: 'https://drive.google.com/file/...' };
      expect(matchesQueue_(record, 'missingIdentity')).toBe(false);
    });

    test('does not match record with both fileId and driveUrl', () => {
      const record = { fileId: 'file-123', driveUrl: 'https://...' };
      expect(matchesQueue_(record, 'missingIdentity')).toBe(false);
    });
  });

  describe('Queue: "noPrompt" - No Prompt Found', () => {
    test('matches record with No Prompt Evidence status', () => {
      const record = { promptEvidenceStatus: 'No Prompt Evidence' };
      expect(matchesQueue_(record, 'noPrompt')).toBe(true);
    });

    test('does not match record with Strong Evidence', () => {
      const record = { promptEvidenceStatus: 'Strong Evidence' };
      expect(matchesQueue_(record, 'noPrompt')).toBe(false);
    });

    test('does not match record with Weak Evidence', () => {
      const record = { promptEvidenceStatus: 'Weak Evidence' };
      expect(matchesQueue_(record, 'noPrompt')).toBe(false);
    });

    test('does not match record with missing status', () => {
      const record = { promptEvidenceStatus: null };
      expect(matchesQueue_(record, 'noPrompt')).toBe(false);
    });
  });

  describe('Queue: "duplicateCandidates" - Duplicate Candidates', () => {
    test('matches record with non-empty duplicate group', () => {
      const record = { duplicateCandidateGroup: 'group-001' };
      expect(matchesQueue_(record, 'duplicateCandidates')).toBe(true);
    });

    test('matches record with whitespace-padded group', () => {
      const record = { duplicateCandidateGroup: '  group-001  ' };
      expect(matchesQueue_(record, 'duplicateCandidates')).toBe(true);
    });

    test('does not match record with empty group', () => {
      const record = { duplicateCandidateGroup: '' };
      expect(matchesQueue_(record, 'duplicateCandidates')).toBe(false);
    });

    test('does not match record with null group', () => {
      const record = { duplicateCandidateGroup: null };
      expect(matchesQueue_(record, 'duplicateCandidates')).toBe(false);
    });

    test('does not match record with whitespace-only group', () => {
      const record = { duplicateCandidateGroup: '   ' };
      expect(matchesQueue_(record, 'duplicateCandidates')).toBe(false);
    });
  });

  describe('Queue: "sourceClearanceNeeded" - Source-Control Clearance Needed', () => {
    test('matches record requiring clearance', () => {
      const record = { sourceControlClearanceNeeded: 'Yes' };
      expect(matchesQueue_(record, 'sourceClearanceNeeded')).toBe(true);
    });

    test('does not match record that does not require clearance', () => {
      const record = { sourceControlClearanceNeeded: 'No' };
      expect(matchesQueue_(record, 'sourceClearanceNeeded')).toBe(false);
    });

    test('does not match record with missing clearance status', () => {
      const record = { sourceControlClearanceNeeded: null };
      expect(matchesQueue_(record, 'sourceClearanceNeeded')).toBe(false);
    });
  });

  describe('Queue: "safeForSourceReview" - Safe for Source Review', () => {
    test('matches verified record without clearance needed', () => {
      const record = {
        sourceVerificationStatus: 'Verified',
        sourceControlClearanceNeeded: 'No'
      };
      expect(matchesQueue_(record, 'safeForSourceReview')).toBe(true);
    });

    test('matches verified record with null clearance', () => {
      const record = {
        sourceVerificationStatus: 'Verified',
        sourceControlClearanceNeeded: null
      };
      expect(matchesQueue_(record, 'safeForSourceReview')).toBe(true);
    });

    test('does not match unverified record', () => {
      const record = {
        sourceVerificationStatus: 'Unverified',
        sourceControlClearanceNeeded: 'No'
      };
      expect(matchesQueue_(record, 'safeForSourceReview')).toBe(false);
    });

    test('does not match verified record needing clearance', () => {
      const record = {
        sourceVerificationStatus: 'Verified',
        sourceControlClearanceNeeded: 'Yes'
      };
      expect(matchesQueue_(record, 'safeForSourceReview')).toBe(false);
    });
  });

  describe('Queue: "visualReview" - Visual Asset Director Review', () => {
    test('matches record assigned to Visual Asset Director', () => {
      const record = { nextOwner: 'Visual Asset Director' };
      expect(matchesQueue_(record, 'visualReview')).toBe(true);
    });

    test('does not match record assigned to Content Team', () => {
      const record = { nextOwner: 'Content Team' };
      expect(matchesQueue_(record, 'visualReview')).toBe(false);
    });

    test('does not match record with null owner', () => {
      const record = { nextOwner: null };
      expect(matchesQueue_(record, 'visualReview')).toBe(false);
    });

    test('does not match record with different owner', () => {
      const record = { nextOwner: 'Source Authority Agent' };
      expect(matchesQueue_(record, 'visualReview')).toBe(false);
    });
  });

  describe('Queue: "instructionalBlocked" - Instructional Use Blocked', () => {
    test('matches record with instructional use blocked', () => {
      const record = { instructionalBlocked: 'Yes' };
      expect(matchesQueue_(record, 'instructionalBlocked')).toBe(true);
    });

    test('does not match record without block', () => {
      const record = { instructionalBlocked: 'No' };
      expect(matchesQueue_(record, 'instructionalBlocked')).toBe(false);
    });

    test('does not match record with missing block status', () => {
      const record = { instructionalBlocked: null };
      expect(matchesQueue_(record, 'instructionalBlocked')).toBe(false);
    });
  });

  describe('Queue: "geminiCandidates" - Gemini Metadata Candidates', () => {
    test('matches record with Gemini metadata', () => {
      const record = { geminiMetadata: { model: 'gemini-pro' } };
      expect(matchesQueue_(record, 'geminiCandidates')).toBe(true);
    });

    test('matches record with non-empty gemini data', () => {
      const record = { geminiMetadata: 'some-gemini-data' };
      expect(matchesQueue_(record, 'geminiCandidates')).toBe(true);
    });

    test('does not match record without Gemini metadata', () => {
      const record = { geminiMetadata: null };
      expect(matchesQueue_(record, 'geminiCandidates')).toBe(false);
    });

    test('does not match record with empty metadata', () => {
      const record = { geminiMetadata: '' };
      expect(matchesQueue_(record, 'geminiCandidates')).toBe(false);
    });
  });

  describe('Queue: "strongEvidence" - Strong Metadata Evidence (Not Approved)', () => {
    test('matches record with strong evidence not requiring review', () => {
      const record = {
        strongMetadataEvidence: 'Yes',
        humanReviewRequired: 'No'
      };
      expect(matchesQueue_(record, 'strongEvidence')).toBe(true);
    });

    test('does not match record requiring human review', () => {
      const record = {
        strongMetadataEvidence: 'Yes',
        humanReviewRequired: 'Yes'
      };
      expect(matchesQueue_(record, 'strongEvidence')).toBe(false);
    });

    test('does not match record without strong evidence', () => {
      const record = {
        strongMetadataEvidence: 'No',
        humanReviewRequired: 'No'
      };
      expect(matchesQueue_(record, 'strongEvidence')).toBe(false);
    });

    test('does not match record with missing evidence status', () => {
      const record = {
        strongMetadataEvidence: null,
        humanReviewRequired: 'No'
      };
      expect(matchesQueue_(record, 'strongEvidence')).toBe(false);
    });
  });

  describe('Unknown queue ID', () => {
    test('returns false for unknown queue', () => {
      const record = { id: '1' };
      expect(matchesQueue_(record, 'unknownQueue')).toBe(false);
    });

    test('returns false for empty queue ID', () => {
      const record = { id: '1' };
      expect(matchesQueue_(record, '')).toBe(false);
    });

    test('returns false for null queue ID', () => {
      const record = { id: '1' };
      expect(matchesQueue_(record, null)).toBe(false);
    });
  });

  describe('Queue overlap and edge cases', () => {
    test('record can match multiple queues', () => {
      const record = {
        fileId: 'file-123',
        promptEvidenceStatus: 'No Prompt Evidence',
        sourceControlClearanceNeeded: 'Yes',
        duplicateCandidateGroup: 'group-1'
      };

      // Should match all these queues simultaneously
      expect(matchesQueue_(record, 'noPrompt')).toBe(true);
      expect(matchesQueue_(record, 'sourceClearanceNeeded')).toBe(true);
      expect(matchesQueue_(record, 'duplicateCandidates')).toBe(true);
      expect(matchesQueue_(record, 'missingIdentity')).toBe(false);
    });

    test('record with conflicting statuses handled correctly', () => {
      const record = {
        strongMetadataEvidence: 'Yes',
        humanReviewRequired: 'Yes'
      };

      // Should match strongEvidence only if NOT requiring review
      expect(matchesQueue_(record, 'strongEvidence')).toBe(false);
    });
  });
});

/**
 * Queue filtering: Verification & review queues
 * Tests: Source Clearance Needed, Safe for Source Review, Visual Review, Instructional Blocked, Strong Evidence
 */

describe('matchesQueue_() - Verification & Review', () => {
  function matchesQueue_(record, queueId) {
    if (queueId === 'sourceClearanceNeeded') return record.sourceControlClearanceNeeded === 'Yes';
    if (queueId === 'safeForSourceReview') return record.sourceVerificationStatus === 'Verified' && record.sourceControlClearanceNeeded !== 'Yes';
    if (queueId === 'visualReview') return record.nextOwner === 'Visual Asset Director';
    if (queueId === 'instructionalBlocked') return record.instructionalBlocked === 'Yes';
    if (queueId === 'strongEvidence') return record.strongMetadataEvidence === 'Yes' && record.humanReviewRequired !== 'Yes';
    return false;
  }

  describe('Queue: "sourceClearanceNeeded"', () => {
    test('matches records requiring clearance', () => {
      expect(matchesQueue_({ sourceControlClearanceNeeded: 'Yes' }, 'sourceClearanceNeeded')).toBe(true);
    });

    test('does not match when not required', () => {
      expect(matchesQueue_({ sourceControlClearanceNeeded: 'No' }, 'sourceClearanceNeeded')).toBe(false);
    });

    test('does not match null status', () => {
      expect(matchesQueue_({ sourceControlClearanceNeeded: null }, 'sourceClearanceNeeded')).toBe(false);
    });
  });

  describe('Queue: "safeForSourceReview"', () => {
    test('matches verified without clearance needed', () => {
      const record = { sourceVerificationStatus: 'Verified', sourceControlClearanceNeeded: 'No' };
      expect(matchesQueue_(record, 'safeForSourceReview')).toBe(true);
    });

    test('matches verified with null clearance', () => {
      const record = { sourceVerificationStatus: 'Verified', sourceControlClearanceNeeded: null };
      expect(matchesQueue_(record, 'safeForSourceReview')).toBe(true);
    });

    test('does not match unverified', () => {
      const record = { sourceVerificationStatus: 'Unverified', sourceControlClearanceNeeded: 'No' };
      expect(matchesQueue_(record, 'safeForSourceReview')).toBe(false);
    });

    test('does not match verified but needing clearance', () => {
      const record = { sourceVerificationStatus: 'Verified', sourceControlClearanceNeeded: 'Yes' };
      expect(matchesQueue_(record, 'safeForSourceReview')).toBe(false);
    });
  });

  describe('Queue: "visualReview"', () => {
    test('matches Visual Asset Director owner', () => {
      expect(matchesQueue_({ nextOwner: 'Visual Asset Director' }, 'visualReview')).toBe(true);
    });

    test('does not match other owners', () => {
      expect(matchesQueue_({ nextOwner: 'Content Team' }, 'visualReview')).toBe(false);
    });

    test('does not match null owner', () => {
      expect(matchesQueue_({ nextOwner: null }, 'visualReview')).toBe(false);
    });
  });

  describe('Queue: "instructionalBlocked"', () => {
    test('matches when blocked', () => {
      expect(matchesQueue_({ instructionalBlocked: 'Yes' }, 'instructionalBlocked')).toBe(true);
    });

    test('does not match when not blocked', () => {
      expect(matchesQueue_({ instructionalBlocked: 'No' }, 'instructionalBlocked')).toBe(false);
    });

    test('does not match null', () => {
      expect(matchesQueue_({ instructionalBlocked: null }, 'instructionalBlocked')).toBe(false);
    });
  });

  describe('Queue: "strongEvidence"', () => {
    test('matches strong evidence without review required', () => {
      const record = { strongMetadataEvidence: 'Yes', humanReviewRequired: 'No' };
      expect(matchesQueue_(record, 'strongEvidence')).toBe(true);
    });

    test('does not match requiring human review', () => {
      const record = { strongMetadataEvidence: 'Yes', humanReviewRequired: 'Yes' };
      expect(matchesQueue_(record, 'strongEvidence')).toBe(false);
    });

    test('does not match without strong evidence', () => {
      const record = { strongMetadataEvidence: 'No', humanReviewRequired: 'No' };
      expect(matchesQueue_(record, 'strongEvidence')).toBe(false);
    });

    test('does not match null evidence', () => {
      const record = { strongMetadataEvidence: null, humanReviewRequired: 'No' };
      expect(matchesQueue_(record, 'strongEvidence')).toBe(false);
    });
  });
});

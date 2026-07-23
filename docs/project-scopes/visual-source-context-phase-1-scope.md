# Visual Source Context Phase 1 Scope

## Objective

Implement issue #10 as an Apps Script-only, mock-first, read-only feature inside `drive-metadata-dashboard` after the minimum stabilization work is complete.

## Entry conditions

- #11 has produced a working non-gating Cloud Build baseline.
- #12 has identified the relevant deployment target and write surfaces.
- #13 has established a trustworthy production-code test pattern.
- #15 has documented the `drive-metadata-dashboard` project boundary.
- No unresolved ambiguity remains about which Apps Script project receives the new files.

## In scope

- Read existing DMSC image rows through approved read services.
- Build a source-context review queue.
- Generate deterministic mock source-context responses.
- Validate the shared response contract.
- Produce a dry-run teacher-facing handoff.
- Preserve uncertainty and evidence labels.
- Mark mock/test data clearly.
- Test that no Sheet, Drive, Notion, approval, readiness, or production records are changed.
- Test that responses do not claim legal or copyright clearance.

## Proposed files

```text
drive-metadata-dashboard/src/VisualSourceContextConfig.gs
drive-metadata-dashboard/src/VisualSourceContextQueueService.gs
drive-metadata-dashboard/src/VisualSourceContextMockWorker.gs
drive-metadata-dashboard/src/VisualSourceContextReportService.gs
drive-metadata-dashboard/src/VisualSourceContextTests.gs
```

Final file names may change to match current project conventions, but the responsibilities should remain separated.

## Response contract requirements

The mock response must include stable identity, source-context fields, confidence, classroom guidance, evidence links, warnings, and explicit mock-provider labeling.

It must:

- preserve unknown and low-confidence states;
- avoid invented certainty;
- avoid legal-clearance language;
- remain compatible with a future hosted worker without requiring one now;
- support dry-run validation before any future write path.

## Out of scope

- Cloud Run
- Google Vision
- Openverse
- PicImageSearch
- reverse-image search
- embeddings or FAISS
- Notion schema changes
- Notion writes
- Sheet writes
- Drive edits
- source approval
- readiness updates
- production deployment

## Acceptance criteria

- [ ] Queue selection uses existing read-only services.
- [ ] Mock responses are deterministic and clearly labeled.
- [ ] Contract validation covers required fields and malformed results.
- [ ] Dry-run handoff is readable by a teacher or reviewer.
- [ ] Tests prove no external writes occur.
- [ ] Tests reject legal-clearance claims.
- [ ] Teacher review remains the final decision point.
- [ ] No hosted service or production integration is required.

## Validation

- Offline contract and formatting tests
- Apps Script-native read-only smoke test against approved test data
- Evidence that row counts, audit counts, and external systems remain unchanged

## Risks

- Mock behavior may accidentally hard-code assumptions that do not fit a future provider.
- New fields may duplicate existing Visual Asset Library mappings.
- Ambiguous source-confidence language may be interpreted as approval.

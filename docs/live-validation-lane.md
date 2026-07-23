# Authorized live validation lane

Issues: #17 and #16 (live portion)

## Approved model

Ordinary PR and Cloud Build jobs do not authenticate to Apps Script, Google Workspace, or Notion. The `validate:live` command performs authorization and target checks only, then emits an operator handoff naming the exact Apps Script entry point. It never deploys or executes Apps Script.

## Suite registry

`config/live-smoke-suites.json` is the canonical classification registry.

Current approved entries:

- `root-read-only` — read-only wrapper; no mutation authorization required.
- `root-source-approval-round-trip` — mutation-bearing wrapper; requires explicit authorization and a dedicated target file ID.

Blocked legacy entries:

- `runDmscBackendSmokeSuite`
- `testApproveDmscSourceForAssetRoundTrip`
- Visual Asset Library production suite pending #33

Blocked suites cannot be emitted by `validate:live`.

## CLI examples

Read-only handoff:

```bash
npm run validate:live -- \
  --suite root-read-only \
  --target root-dashboard \
  --environment staging
```

Mutation handoff:

```bash
npm run validate:live -- \
  --suite root-source-approval-round-trip \
  --target root-dashboard \
  --environment staging \
  --authorize YES_I_ACKNOWLEDGE_LIVE_MUTATION
```

The command returns `executionPerformed: false`. The operator must separately open the verified Apps Script target and run the emitted entry point.

## Required Script Properties for the authorized mutation suite

- `DMSC_LIVE_SMOKE_MODE=MUTATION_ALLOWED`
- `DMSC_LIVE_SMOKE_CONFIRMATION=YES_I_ACKNOWLEDGE_LIVE_MUTATION`
- `DMSC_LIVE_SMOKE_TARGET_FILE_ID=<dedicated non-production test record>`

## Evidence contract

`runDmscAuthorizedSourceApprovalRoundTrip()` reports:

- suite and classification;
- exact target file ID and sheet;
- start and finish times;
- assertion result;
- changed fields;
- cleanup attempted;
- cleanup verified by field-by-field comparison;
- cleanup error;
- permanent append-only audit rows.

A passing assertion with failed cleanup is an overall failure.

## Production boundary

Production is denied by default in the CLI and by every current registry entry. No live suite is authorized for production.

## Concurrency

Only one mutation run may be performed against a target at a time. The current operator lane is manual and must not be automated until #33 is complete and a target-specific lock is enforced in every write path.

## Offline relationship

This document completes the live-lane interface and safety boundary. Issue #16 remains open until #13 supplies trustworthy production-code offline tests and the final `validate:offline` command is assembled.

# Validation and Test Integrity Scope

## Objective

Create trustworthy validation that distinguishes offline regression evidence from authorized live Apps Script smoke evidence.

## Issues

- #13 — Repair Jest tests to execute production code
- #16 — Create separate offline and live validation lanes
- #17 — Make live Apps Script smoke tests mutation-safe

## Problem statement

Current root Jest tests include local copies of production functions. A passing test can therefore prove the copied implementation works while the repository implementation has changed. Apps Script-native smoke suites also include both read-only checks and real mutations.

## Milestone A — Production-code test harness

### In scope

- Identify copied implementations in Jest tests.
- Add a reusable loader or extraction pattern for Apps Script-compatible source.
- Execute the real production functions under test.
- Preserve explicit mocks for unsupported Apps Script globals.
- Add a controlled proof that changing production behavior changes the test result.

### Exit criteria

The targeted regression tests do not redefine the functions they claim to test.

## Milestone B — Validation lanes

### Offline lane

Must be credential-free, deterministic, runnable in Cloud Build, and return a nonzero exit code on failure.

Expected categories:

- production-code Jest tests
- schema/metadata validators
- fixture-based Node checks
- static configuration checks that require no Google access

### Live lane

Must remain separate from ordinary PR CI and document:

- Apps Script project target
- required Script Properties
- read-only or mutation classification
- required test records
- cleanup behavior
- evidence output

## Milestone C — Mutation-safe smoke tests

### Required behavior

- Use dedicated test records where possible.
- Capture original values before changing data.
- Restore mutable fields in `finally` blocks.
- Verify restoration explicitly.
- Report append-only audit effects.
- Require an explicit test-mode property or confirmation.
- Fail closed when cleanup is incomplete.

## Out of scope

- Putting OAuth or Notion credentials into Cloud Build
- Automatic Apps Script deployment
- Treating live smoke tests as unit tests
- Weakening production audit or approval guards

## Acceptance evidence

- Offline command and exact subcommands
- Tests executed and results
- Live-suite inventory
- Mutation and cleanup matrix
- Known Apps Script runtime gaps
- Remaining external-test requirements

## Risks

- Over-mocking can recreate the current false-confidence problem.
- A failed live cleanup can leave routing, source approval, or audit state changed.
- Calling the offline lane `validate:all` may overstate its coverage.

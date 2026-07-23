# Stabilization Roadmap Scope

## Objective

Stabilize repository operations before expanding feature scope. This workstream covers the Cloud Build baseline, stale pull-request reconciliation, and architecture documentation.

## Issues

- #11 — Add non-gating Cloud Build root Jest baseline
- #14 — Reconcile stale PRs #5, #6, and #9
- #15 — Document repository architecture and operating boundaries

## Milestone A — Cloud Build baseline

### In scope

- Review `chore/add-cloud-build-validation` against current `main`.
- Open a draft PR containing the root `cloudbuild.yaml`.
- Run `npm ci` and `npm test` only.
- Record build ID, tested SHA, step results, result, and exit status.
- Describe the check as a root Jest baseline.

### Out of scope

- Required checks
- Deployment
- `clasp push`
- Live Apps Script testing
- External writes
- Production credentials

### Exit criteria

The first Cloud Build run completes and its limitations are documented.

## Milestone B — Stale PR disposition

### PR #5

Close as obsolete or superseded. Do not merge its accumulated branch history. Recreate only individually justified capabilities from current `main`.

### PR #6

Confirm the source-authority audit implementation already exists on `main`, preserve canonical file links, and close as superseded.

### PR #9

Create a file-level keep/drop/split matrix. Replace surviving work with focused current-main changes rather than a wholesale rebase.

### Exit criteria

Each stale PR has a factual disposition and any surviving work has a focused issue or fresh branch.

## Milestone C — Architecture documentation

Document every deployable Apps Script project, manifest, source root, deployment path, test lane, and write boundary. Mark legacy and current components explicitly.

### Exit criteria

A new operator can determine which folder, manifest, test command, and deployment target apply without guessing.

## Dependencies

- Milestone A can begin immediately.
- Issue #12 informs the final architecture matrix.
- Issue #14 should prevent stale documentation from being copied forward.

## Risks

- A passing root Jest build may be mistaken for full repository coverage.
- Stale branch rebases may overwrite newer work.
- Incorrect architecture documentation may direct a push to the wrong project.

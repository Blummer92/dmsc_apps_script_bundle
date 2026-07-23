# DMSC Improvement Project Scopes

This directory is the implementation-planning index for the repository stabilization roadmap validated on 2026-07-23.

These files define scope only. They do not authorize Google Cloud, Apps Script, Drive, Sheets, Notion, production, permission, or sharing changes.

## Active workstreams

| Workstream | Scope file | Issues |
|---|---|---|
| Stabilization and backlog reconciliation | `stabilization-roadmap.md` | #11, #14, #15 |
| Validation and test integrity | `validation-scope.md` | #13, #16, #17 |
| Deployment and write-surface safety | `deployment-safety-scope.md` | #12, #18 |
| Visual Source Context mock phase | `visual-source-context-phase-1-scope.md` | #10 |

## Recommended order

1. #11 — establish the non-gating Cloud Build root Jest baseline.
2. #12 — inventory deployment targets and write surfaces.
3. #13 — repair Jest tests so they execute production code.
4. #14 — reconcile stale PRs #5, #6, and #9.
5. #15 — document repository architecture and operating boundaries.
6. #16 — create separate offline and live validation lanes.
7. #17 — make live smoke tests mutation-safe.
8. #18 — standardize project-specific clasp safeguards.
9. #10 — implement the Visual Source Context Apps Script mock phase.

## Shared rules

- Start new implementation work from current `main`.
- Use one focused issue and one focused pull request per milestone.
- Keep Cloud Build credential-free and deployment-free until separately approved.
- Treat Apps Script-native live tests as a separate authorized lane.
- Do not merge stale PRs wholesale.
- Preserve separate Apps Script deployment targets.
- Prefer read-only, dry-run, and mock behavior before controlled writes.
- Report files changed, tests run, docs updated, blockers, handoffs, and remaining risks.

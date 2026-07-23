# Root scan and metadata-merge dependency audit

Issue: #27

## Conclusion

The canonical repository does not contain implementations for either function invoked by the root dashboard:

- `runDriveImageScanOnly()`
- `runMergedImagePromptMetadata()`

Repository-wide code search finds only the wrapper calls in `Code.gs` and a Jest test that references the wrapper behavior. The implementations must therefore be treated as external, local-only, deployed-only, or missing. Until an authoritative source is identified, both actions are **Unknown — live execution blocked**.

## Confirmed wrapper behavior

### `dmscRunDriveScanFromDashboard()`

- checks whether `runDriveImageScanOnly` exists;
- invokes it without arguments;
- appends a permanent `DMSC Audit Log` entry after the call returns;
- contains no rollback, idempotency key, dry-run mode, target check, or cleanup verification.

### `dmscRunMergeFromDashboard()`

- checks whether `runMergedImagePromptMetadata` exists;
- invokes it without arguments;
- interprets the return value as `rowsCreated`;
- appends a permanent audit entry;
- contains no rollback, idempotency key, dry-run mode, target check, or partial-failure report.

## Risk classification

| Risk | Scan wrapper | Merge wrapper |
| --- | --- | --- |
| Implementation source | Unknown | Unknown |
| Direct wrapper mutation | append-only audit row | append-only audit row |
| Downstream mutation | Unknown | Probable persistent row creation/update |
| Drive effects | Unknown | Unknown |
| Sheets effects | Unknown | Probable |
| Script Properties | Unknown | Unknown |
| External HTTP calls | Unknown | Unknown |
| Idempotency | Unknown | Unknown |
| Retry safety | Unknown | Unknown |
| Cleanup | None in wrapper | None in wrapper |
| Live authorization | Absent | Absent |

## Required operator behavior

The dashboard buttons must not be treated as safe merely because the wrappers check whether a function exists. Presence proves only that a function is installed in the Apps Script runtime; it does not prove source provenance, target identity, reviewed behavior, or cleanup safety.

Until the implementations are added to the canonical repository or linked to an approved source:

1. keep both actions blocked from automated or live validation lanes;
2. do not install local copies into a bound project;
3. do not grant additional Drive or Sheets scopes to make the buttons work;
4. do not classify either action as read-only;
5. surface an explicit operator warning that the implementation is outside the canonical repository.

## Recommended implementation disposition

Create one focused implementation issue to harden the root dashboard dependency boundary:

- replace bare global-function detection with a dependency descriptor that includes source version and declared capabilities;
- require an explicit authorization property for mutation-bearing actions;
- return structured evidence including target, rows/files inspected, rows/files changed, warnings, and partial failures;
- require idempotency or duplicate-detection behavior for merge operations;
- append the audit record in a `finally`-aware result path so failed operations are also recorded honestly;
- disable or hide the UI actions when the dependency provenance is unknown.

The actual scan and merge implementations should be imported into the canonical repository as separately reviewed modules or removed from the dashboard contract. A deployed-only implementation is not an acceptable source of truth.

## Validation performed

Read-only GitHub repository search and source inspection only. No Apps Script function, Drive scan, metadata merge, Sheet write, credential, deployment, or external system was used or modified.

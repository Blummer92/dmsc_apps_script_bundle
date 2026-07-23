# Apps Script write surfaces, live-test mutations, and cleanup behavior

Issue: #23  
Parent: #12  
Status: read-only repository inventory

## Classification rules

- **Read-only**: reads repository or external state without mutation.
- **Preview/dry-run**: builds or validates proposed changes without writing.
- **Staging write**: writes only to an explicitly guarded staging target.
- **Production/write-capable**: mutates live Sheets, Drive, Notion, Script Properties, approval, readiness, routing, or audit state.
- **Test mutation**: temporarily or permanently mutates live state during a test.
- **Unknown**: insufficient evidence; live execution blocked.

Function names such as `get`, `preview`, `dryRun`, `test`, and `validate` are not treated as proof of safety.

## Confirmed write surfaces

| Project / file | Entry point or service | Target | Classification | Important behavior | Confidence |
| --- | --- | --- | --- | --- | --- |
| Root `Code.gs` | `updateDmscReviewMetadata` | Google Sheets registry and audit log | production/write-capable | updates allowlisted routing fields, writes sync timestamp, appends audit entry | Confirmed |
| Root `Code.gs` | `dmscRunDriveScanFromDashboard` | downstream scan function plus audit log | indirect write / unknown blast radius | invokes externally supplied `runDriveImageScanOnly()` and appends audit entry | Confirmed entry point; downstream effects Unknown |
| Root `Code.gs` | `dmscRunMergeFromDashboard` | merged metadata and audit log | indirect production write | invokes `runMergedImagePromptMetadata()` and appends audit entry | Confirmed entry point; downstream effects Probable |
| Root `DMSC_SourceApproval.gs` | `approveDmscSourceForAsset` | DM Source Library Pilot and audit log | source-approval production write | sets approval status/evidence/actor/date/restrictions/prompt fields and `pilot_review_status=Production Approved` | Confirmed |
| Root `DMSC_SourceApproval.gs` | `applyDmscSourceLibraryUpdates_` | DM Source Library Pilot and audit log | internal production write helper | writes allowlisted fields and appends one audit row per changed field | Confirmed |
| Builder dashboard `Services.gs` / `Logging.gs` | setup, create, update, and log functions described by README | Google Sheets operational tables | production/write-capable | creates five tabs, operational records, handoffs, change logs, and audit/log rows | Confirmed from runtime search and README |
| Drive Metadata Dashboard `NotionSyncService.gs` | staging sync entry points | Notion staging data source | staging write | guarded row and eligible-batch upserts after explicit mode/approval checks | Confirmed from README and source presence |
| Drive Metadata Dashboard Visual Asset Library services | write/sync/production manager functions | Notion Visual Asset Library and control/history state | staging or production write depending on service and mode | multiple managers, validation, proof, control, history, and production-sync services exist; each must remain separately guarded | Confirmed existence; symbol-level matrix still required before live use |
| Search feature | search and configuration readers | Sheets/Drive metadata | read-only | project documentation states no record creation, merge, deletion, or update | Probable pending full symbol trace |

## Confirmed read-only and preview surfaces

| Project | Surface | Notes | Confidence |
| --- | --- | --- | --- |
| Root dashboard | summary, queue, row, detail, and spreadsheet-link getters | reads spreadsheet data and derived metadata; link getter exposes navigation only | Confirmed |
| Search feature | `searchCurriculum`, Sheet search, Drive metadata search | reads configured index/folders; Drive search is optional and off by default | Confirmed from README; runtime trace recommended |
| Drive Metadata Dashboard UI | visible dashboard views | README states visible UI cannot write; write functions are separate explicit Apps Script entry points | Confirmed documentation boundary; runtime contradiction checks still required |
| Drive Metadata Dashboard | dry-run Notion functions | builds/logs payloads without Notion write | Confirmed from README |
| Builder dashboard | `prepareOperationalSync` | validates payload and returns dry-run diff | Confirmed from README |

## Live-test mutation matrix

| Test / function | Mutation | Cleanup | Irreversible effects | Authorization status | Risk |
| --- | --- | --- | --- | --- | --- |
| `testApproveDmscSourceForAssetRoundTrip` | temporarily approves the first dashboard record and changes up to nine source-approval fields | `finally` restores copied field values | both approval and restore paths append audit rows per changed field; audit entries are not removed | explicit live authorization required | Critical |
| Root dashboard manual checklist | updates routing metadata on a test row | no automated restoration documented | appends a permanent `DMSC Audit Log` row | explicit live authorization required | High |
| Drive scan/merge dashboard actions | invokes external scan/merge functions | no rollback in entry point | permanent merged metadata and audit records are possible | blocked until downstream implementations are inventoried | Critical |
| Drive Metadata staging sync | writes rows or eligible batches to Notion staging | no automatic rollback promised by README | Notion page creation/update history may persist | explicit staging properties and approval required | High |
| Visual Asset Library production-sync tests | source file exists and uses Script Properties | cleanup behavior not established by this inventory | potential Notion production writes and history/control updates | Unknown — live execution blocked | Critical |

## Key cleanup finding

`testApproveDmscSourceForAssetRoundTrip` restores the primary source-library fields in a `finally` block, but every changed field is audited during both the approval and restoration calls. The test therefore cannot be described as fully reversible. It restores business fields while leaving permanent append-only audit evidence.

A successful assertion is not equivalent to successful cleanup. Future live-test reporting must include at least:

- assertion result;
- restoration attempted;
- restoration verified;
- append-only effects created;
- cleanup errors;
- final target identity.

## Indirect-write risks

1. `dmscRunDriveScanFromDashboard` delegates to a function not defined by the dashboard bundle. Its name suggests scanning, but the downstream implementation may create or update sheet rows or Drive metadata.
2. `dmscRunMergeFromDashboard` delegates to a merge function and reports `rowsCreated`, strongly indicating persistent mutation.
3. External HTTP/Notion helpers can cause downstream writes even when the Apps Script caller primarily validates or previews.
4. Visual Asset Library services are split across write, sync, manager, control, history, validation, dry-run proof, and production-sync files. A top-level name alone is insufficient to determine the final target or mode.
5. Script Properties are both configuration and mutable state; cursor, mode, approval, and control values must be classified as configuration writes when code changes them.

## Documentation contradictions

| Claim | Runtime evidence | Disposition |
| --- | --- | --- |
| Root README safety boundary says dashboard is metadata-only | root `Code.gs` updates routing metadata and audit log; source-approval backend sets production approval fields | README must distinguish visible dashboard authority from installed backend write functions |
| Root README describes a four-file dashboard bundle | repository now contains multiple deployable projects and many retained modules | superseded by #15 architecture documentation |
| Drive Metadata Dashboard headline says read-only | README later documents guarded Notion staging and production-oriented Visual Asset Library services exist | preserve UI/read boundary but state clearly that repository project includes separate write entry points |
| Round-trip source approval test appears to restore state | audit rows remain after both mutation and restoration | classify as mutation-bearing with irreversible append-only effects |

## Required stop conditions

Live execution is blocked when:

- the exact target project, environment, account, and dataset are not named;
- a function calls an untraced helper;
- cleanup does not run in `finally` or equivalent failure handling;
- cleanup verification is absent;
- append-only effects are undisclosed;
- production is the default target;
- two mutation runs can overlap against the same dataset;
- a credential or Script Property value would be printed;
- dry-run and write modes share an ambiguous command or parameter.

## Follow-up disposition

- #13: load real production functions for offline tests; copied implementations are insufficient.
- #16: keep credential-free offline validation separate from explicitly authorized live validation; serialize by target.
- #17: harden mutation suites, verify cleanup, and report append-only effects.
- #15: correct README claims so UI read-only boundaries are not confused with repository-wide write capability.
- Focused follow-up recommended: inspect and classify every Visual Asset Library production/sync/test public symbol before any live execution.

## Validation performed

Repository code and documentation were inspected through GitHub only. No Apps Script function, Notion call, Drive operation, Sheet mutation, Script Property change, credential, or live system was used or modified.

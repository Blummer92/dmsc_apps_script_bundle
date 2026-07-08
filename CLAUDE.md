# dmsc_apps_script_bundle

This repo bundles **four independently deployed Google Apps Script projects**, not one app. Each has its own Script ID, its own `clasp` config, and is pushed to its own bound spreadsheet separately. Changes in one project never affect another at runtime — the only thing they share is a repo and a governance convention (below).

| Project | Path | What it does |
| --- | --- | --- |
| Legacy DMSC dashboard | repo root (`Code.gs`, `Dashboard.html`, ...) | Original single-file metadata review console for an image registry. Monolithic, hardcodes its spreadsheet ID in `DMSC_APP_CONFIG`. Kept for the existing test bundle; not the pattern to copy for new work. |
| Apps Script Builder Dashboard | `apps-script-builder-dashboard/` | Tracks build/deployment metadata for Apps Script projects themselves (meta: a dashboard about the other dashboards). Newest, cleanest example of the sync-guard pattern below. |
| Drive Metadata Dashboard | `drive-metadata-dashboard/` | Read-only Drive image metadata review console, plus a guarded Notion staging-sync feature (Visual Asset Library). The most complex project here. |
| Curriculum Search | `search-feature-app/` | Read-only search sidebar across a Sheets metadata index and optional Drive folders. |

See each project's own `CLAUDE.md` for its specifics.

## The governance pattern (read this before editing any of the three modern projects)

This repo is one piece of a larger multi-agent curriculum system. Each project explicitly does **not** own curriculum authority data (readiness status, lesson/packet approval, source-of-truth identity) — that belongs to other agents/dashboards. Every modern project (everything except the legacy root dashboard) enforces this the same way:

1. **A denylist of curriculum-authority fields** (`readiness_status`, `packet_approval`, `source_authority`, etc.) that the project must never write, checked at the point of any write.
2. **A `_lookup` / `_relation` suffix convention** — fields ending in `_lookup` are display-only mirrors of another database's data; a project may read and show them but never write them back.
3. **Dry-run-by-default sync** — anything that could write to an external system (Notion, another sheet) defaults to a dry-run/mock mode and requires an explicit confirmation flag to actually write live.
4. **`metadata/handoff.json` + `metadata/schema-map.json`** in each project — governance handoff documents (not executed code) that describe field ownership and pending questions for the "Dashboard Sync Agent" review process. If you add or change a field's ownership, these are meant to be updated, though nothing enforces that automatically (see Known Gaps below).

If you're adding a new write path anywhere in this repo, it needs to go through the equivalent of #1–#3 for that project, not bypass it because it's convenient.

## Known gaps agents should watch for

- **Schema files can drift from code.** Each project's `metadata/*.json` is hand-maintained separately from the JS/GS constants it's supposed to describe (e.g. `apps-script-builder-dashboard/metadata/field-contract.json` vs. `src/Config.gs`'s `FIELD_CONTRACT`). Nothing keeps them in sync. If you change field ownership or add a field, update both, and don't trust the JSON blindly — check the `.gs` source first.
- **No CI test run.** Test files exist (e.g. `drive-metadata-dashboard/src/VisualAssetLibraryProductionSyncTest.gs`) but there's no workflow that runs them; they're meant to be pasted/run manually in the Apps Script editor. `.github/workflows/` only has `label.yml` (path-based PR labeling) — there is no test or lint CI.
- **`.github/labeler.yml` must live on `main`.** The Labeler workflow uses `pull_request_target`, and `actions/labeler@v4` reads its config from the **base branch**, not the PR branch, for security reasons. Don't "fix" a failing `label` check by editing `labeler.yml` only in a PR branch — it won't take effect until merged.
- **No shared runtime code across projects.** Apps Script has no cross-project import mechanism, so the denylist/guard logic below is copy-pasted per project with slightly different names each time (`assertNoAuthorityWrites_` vs `assertCurriculumFieldsAreLookupOnly` vs inline checks). When fixing a governance bug, check whether the same bug exists in the other two projects' copies of the pattern.

## Working in this repo

- Each project directory has its own `README.md` with clasp setup/deploy steps — follow that project's, not a generic one.
- Match the existing per-project style before introducing new patterns (e.g. don't add TypeScript, a bundler, or `.includes()`-heavy chains where the existing file uses `indexOf` — check the file you're editing first).
- Apps Script globals (`SpreadsheetApp`, `PropertiesService`, `LockService`, `Utilities`, `HtmlService`) aren't available outside the Apps Script runtime. To sanity-check `.gs` logic without deploying, mock these globals and run the file through Node's `vm` module — see the commit history around `apps-script-builder-dashboard/src/Services.gs` (`getProject`/`updateProject`) for a working example of this approach.

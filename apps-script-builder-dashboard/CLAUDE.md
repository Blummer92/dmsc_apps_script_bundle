# apps-script-builder-dashboard

A Sheets-backed dashboard that tracks operational metadata for *other* Apps Script projects (build status, deployment status, logs, handoffs) — it does not track curriculum content itself. This is the cleanest example of the repo-wide governance pattern (see root `CLAUDE.md`); read this file to understand the pattern in depth, then apply the same shape elsewhere.

## File map

- `src/Config.gs` — all constants: sheet names, schemas (`DASHBOARD_SCHEMA`), the field ownership contract (`FIELD_CONTRACT`), and the three field lists that drive every guard: `WRITABLE_OPERATIONAL_FIELDS` (allowlist), `DENIED_SYNC_FIELDS` (denylist), `RELATION_FIELDS` (needs owner review before live write).
- `src/Validation.gs` — input shape validation (`validateProjectInput_`, `validateLogInput_`) and one-off write-time checks (`assertNoAuthorityWrites_`).
- `src/SyncGuards.gs` — the reusable sync-safety layer: `filterAppsScriptOperationalPayload` (throws on any denied/lookup/non-allowlisted field), `prepareOperationalSync` (dry-run diff, mode gating), `getSyncMode`/`setSyncMode` (mock vs. live, stored in script properties).
- `src/Services.gs` — the actual sheet CRUD: `createProject`, `getProject`, `updateProject`, `setupDashboard`, `getDashboardSummary`, plus low-level row helpers (`rowFromObject_`, `objectFromRow_`, `findProjectRow_`, `appendRows_`).
- `src/Logging.gs` — typed log writers (`logBug`, `logDecision`, `logPerformance`, `logChange`) and `createHandoffRecord`.
- `src/Code.gs` — `onOpen`/sidebar menu entrypoints. Thin; almost nothing here calls into governance logic directly.
- `metadata/field-contract.json`, `metadata/schema-map.json`, `metadata/handoff.json`, `metadata/change-log-schema.json` — governance documents mirroring `Config.gs`'s constants for human/agent review. **These are hand-maintained copies, not generated from the code** — see Known Gaps below.

## The sync-guard pattern (use this shape for any new write function)

1. Validate shape (`validateProjectInput_`-style): required fields present, no unknown keys.
2. Run the payload through `filterAppsScriptOperationalPayload` — this throws if the payload touches a curriculum-authority field, a `_lookup` field, or anything not in `WRITABLE_OPERATIONAL_FIELDS`.
3. Call `prepareOperationalSync(payload, currentRecord, options)` to get a diff. In `mock` mode (the default, set by `setupDashboard`) this **always** returns `dry_run: true` and does not write — that's intentional, not a bug to "fix" by making mock mode write.
4. Only apply the write if `sync_mode === 'live'` **and** the caller passed `options.live_write_confirmed: true`. `RELATION_FIELDS` additionally require `options.owner_review_confirmed`.
5. Log every applied change to the Change Log sheet via `logChange` — one row per changed field, not one row per call (see `updateProject` in `Services.gs` for the reference implementation).

`getProject`/`updateProject` in `Services.gs` are the reference implementation of this whole pattern end to end — copy that shape rather than re-deriving it.

## Known gaps

- **`FIELD_CONTRACT` (Config.gs) and `metadata/field-contract.json` will drift.** They already use different value formats for the same data — `Config.gs` uses machine constants like `APP_CONFIG.OWNERSHIP.CANONICAL_APPS_SCRIPT` (`'canonical_apps_script_metadata'`), while the JSON file spells the same classification out as the human string `"Canonical Apps Script metadata"`. If you change field ownership, update both files by hand; there is no build step that generates one from the other.
- **No test file exists for this project** (unlike `drive-metadata-dashboard`, which has `VisualAssetLibraryProductionSyncTest.gs`). If you add non-trivial logic here, consider mocking Apps Script globals (`SpreadsheetApp`, `PropertiesService`, `LockService`, `Utilities`) and running the `.gs` source through Node's `vm` module rather than trusting manual testing in the Apps Script editor alone.
- **`Client.html`/`Ui.html` only call `getClientDashboardSummary`.** `createProject`/`getProject`/`updateProject` are server-side API surface for other agents/scripts to call directly (e.g. via `google.script.run` from a different UI, or another Apps Script project with cross-project access) — they are intentionally not wired into this project's own sidebar.

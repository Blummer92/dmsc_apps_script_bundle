# Apps Script project boundaries and clasp target identity

Issue: #22  
Parent: #12  
Status: read-only repository inventory

## Safety rule

No deployment target is approved solely because a `.clasp.json` file exists. Before any future push, the operator must verify the repository directory, manifest, configured `rootDir`, effective `.claspignore`, expected source files, and a non-secret target fingerprint. Unknown targets are deployment-blocked.

## Project matrix

| Project | Repository working directory | Deployable manifest | clasp configuration | Upload boundary | Classification | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| Legacy root DMSC dashboard | repository root | `appsscript.json` | committed root `.clasp.json`; `rootDir` is repository root | root `.claspignore` excludes tooling, tests, metadata, audit scratch files, and all three sibling projects | deployable legacy/current test bundle; write-capable | Confirmed |
| Apps Script Builder Dashboard | `apps-script-builder-dashboard/` | `apps-script-builder-dashboard/src/appsscript.json` | local `.clasp.json` copied from placeholder-only `.clasp.json.example`; `rootDir: src` | `src/` only through `rootDir`; root manifest is reference-only | separate deployable project | Confirmed |
| Drive Metadata Dashboard | `drive-metadata-dashboard/` | `drive-metadata-dashboard/appsscript.json` | `.clasp.json.example` currently contains a concrete Script ID and `rootDir: .`; helper scripts generate/use local `.clasp.json` | `.claspignore` permits only the manifest and `src/` | separate deployable project with guarded Notion staging writes | Confirmed |
| Curriculum Search Apps Script | `search-feature-app/` | `search-feature-app/appsscript.json` | local `.clasp.json` copied from placeholder `.clasp.json.example` | `.claspignore` permits manifest plus `.gs`/`.html` under `src/` | separate read-only deployable project | Confirmed |

## Evidence

### Legacy root project

- `README.md` describes the root bundle and its root `appsscript.json`.
- `.clasp.json` is committed, points at a concrete target, uses repository-root `rootDir`, and allows subdirectories.
- `.claspignore` explicitly excludes `apps-script-builder-dashboard/**`, `drive-metadata-dashboard/**`, and `search-feature-app/**`.
- Root `Code.gs` contains both read paths and write-capable routing/audit functions, so this target must not be treated as read-only.

### Apps Script Builder Dashboard

- `apps-script-builder-dashboard/README.md` states that `src/appsscript.json` is deployable and the root manifest is reference-only.
- `.clasp.json.example` is placeholder-only and sets `rootDir` to `src`.
- The project creates and updates Sheets-backed operational metadata and logs; target isolation is required.

### Drive Metadata Dashboard

- `drive-metadata-dashboard/README.md` identifies a separate project, manifest, `.claspignore`, example clasp file, and preflight scripts.
- `.claspignore` defaults to deny-all and permits only `appsscript.json` and `src/**`.
- The README requires the `drive-metadata-dashboard` working directory and lists required files before push.
- The committed example and README currently expose a full concrete Script ID. Treat that as an operational-metadata exposure requiring a focused cleanup; do not reproduce it in new documentation or logs.
- Existing preflight behavior is project-specific and should be generalized by #18 rather than copied.

### Curriculum Search Apps Script

- `search-feature-app/README.md` identifies a separate bound-spreadsheet deployment.
- `.claspignore` permits only `appsscript.json`, `src/**/*.gs`, and `src/**/*.html`.
- `.clasp.json.example` is intended to remain local after replacing a placeholder Script ID.
- Runtime configuration is supplied through Script Properties and the project is documented as read-only.

## Target fingerprints

Future preflight code should compare a redacted fingerprint, not print complete Script IDs.

| Project | Required fingerprint inputs |
| --- | --- |
| Root dashboard | repository root; root manifest; root `.claspignore`; required root UI/backend files; hash or final-six-character target suffix |
| Builder dashboard | `apps-script-builder-dashboard`; `rootDir=src`; `src/appsscript.json`; required `src/Code.gs`, `src/Services.gs`, and UI files |
| Drive Metadata Dashboard | `drive-metadata-dashboard`; `rootDir=.`; root manifest; deny-all allowlist ignore file; required Notion/Sheet services |
| Search feature | `search-feature-app`; root manifest; source-only ignore rules; required search services and UI files |

## Critical contradictions and risks

1. **Concrete Script IDs are committed.** The root `.clasp.json` and Drive Metadata example/README contain complete target identifiers. Script IDs are not OAuth secrets, but they are sensitive operational metadata and should be redacted from examples and logs.
2. **Root push has the largest blast radius.** The root config uses repository-root scope and permits subdirectories. Safety currently depends on `.claspignore` remaining correct.
3. **Manifest duplication exists in the builder project.** Only `src/appsscript.json` is deployable; the root copy can mislead operators and automation.
4. **Drive Metadata preflight performs a push.** The current script name and README combine validation with deployment. #18 should split pure preflight from separately authorized push execution.
5. **Project-specific safeguards can drift.** One shared data-driven preflight should consume this matrix.

## Required stop conditions

Block deployment when any of these is true:

- current directory does not exactly match the selected project;
- manifest path or `rootDir` differs from this matrix;
- candidate upload files include a sibling project or repository tooling;
- target fingerprint is unknown or mismatched;
- `.claspignore` is absent, unexpectedly permissive, or changed without review;
- local generated files differ from reviewed source without an explicit exception;
- the repository is dirty and the exact deployment contents cannot be reproduced;
- credentials, target identity, or rollback point are unclear.

## Follow-up disposition

- #18: implement one reusable, declarative preflight and separate validation from push authorization.
- #15: convert this matrix into operator-facing repository architecture and deployment instructions.
- Focused cleanup issue recommended: remove complete Script IDs from committed examples/README text and replace them with placeholders plus redacted fingerprints.

## Validation performed

Repository files were inspected through GitHub only. No clasp command, Apps Script function, external API, credential, or live system was used or modified.

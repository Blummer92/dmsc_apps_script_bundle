# Apps Script target preflight

Issue: #18

The repository uses one declarative registry, `config/apps-script-targets.json`, and one reusable preflight, `scripts/clasp-target-preflight.mjs`.

## Safety contract

Preflight never pushes or deploys. It verifies:

- selected target name;
- exact repository project directory;
- local `.clasp.json` presence;
- local Script ID matches a separately supplied expected value;
- configured `rootDir`;
- manifest and required files;
- `.claspignore` presence where required;
- candidate upload paths do not include forbidden sibling or tooling paths.

It prints only a short SHA-256 target fingerprint.

## Local use

```bash
export DMSC_DRIVE_METADATA_EXPECTED_SCRIPT_ID="<local expected target>"
npm run clasp:preflight -- --target drive-metadata-dashboard --with-status
```

Other target environment variables are declared in the registry. Values remain local and must not be committed, pasted into logs, or added to issues.

## Supported targets

- `root-dashboard`
- `builder-dashboard`
- `drive-metadata-dashboard`
- `search-feature`

## Tests

```bash
npm run test:clasp-preflight
```

The fixture suite covers valid configuration, wrong directory, wrong target, sibling-project leakage, and unknown target handling.

## Deployment boundary

A passing preflight is necessary but not sufficient to authorize a push. Deployment still requires explicit target/environment approval, reviewed candidate files, separately authorized credentials, a rollback point, and post-push verification. `clasp push --force` is not authorized by this workflow.

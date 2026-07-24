# Apps Script entry-point caller references

Issue: #51

## Purpose

The declaration inventory from #45 answers which top-level Apps Script symbols exist. This checker answers where repository-visible callers refer to those symbols.

`config/apps-script-entry-points.json` remains the canonical classification policy. The caller checker never redefines whether a symbol is retired, mutation-bearing, read-only, or approved.

The caller report is derived evidence keyed by `project:symbol`.

## Supported caller forms

The checker currently scans for:

- menu handler strings passed to `.addItem()`;
- direct `google.script.run.someHandler()` calls;
- literal and dynamic bracket-form `google.script.run[...]` calls;
- direct source calls to known deployable symbols;
- `entryPoint` values in `config/live-smoke-suites.json`;
- governed documentation mentions classified as safety warnings, migration notes, operator instructions, or historical mentions;
- repository trigger setup and simple handler declarations.

This is static repository analysis. It does not prove that user-owned deployed installable triggers are absent.

## Temporary caller exceptions

Temporary exceptions live in:

```text
config/apps-script-entry-point-callers.json
```

The file contains caller-specific metadata only. It does not copy canonical symbol classifications.

Each exception must include:

- `symbolKey`
- `caller`
- `callerType`
- `owner`
- `reason`
- `replacement`
- `removalIssue`

An exception is a bounded migration record, not approval for new use.

## Validation commands

Run caller validation without generating a report:

```bash
npm run test:entry-point-callers
```

Run only the repository scan:

```bash
node scripts/check-apps-script-entry-point-callers.mjs --no-write
```

Generate the derived JSON report intentionally:

```bash
npm run generate:entry-point-callers
```

The generated file is:

```text
docs/apps-script-entry-point-callers.json
```

Normal validation uses `--no-write`, so tests do not leave the generated report behind.

## Failure policy

Validation fails when:

- a retired symbol has an executable caller without a complete temporary exception;
- a deployable dynamic caller cannot be resolved or reviewed;
- an executable caller points to a symbol absent from the canonical declaration inventory;
- a temporary exception is missing required metadata.

A declaration by itself does not count as a caller. A safety document naming a blocked symbol is documentation evidence rather than an executable caller.

## Known limitations

- Direct-call detection is intentionally conservative and is not a complete JavaScript call graph.
- Patch files can override earlier client behavior at runtime; static references are still reported because they remain deployable source.
- Documentation classification uses bounded heuristics and requires review when wording is ambiguous.
- Repository scanning cannot inspect deployed triggers owned by other accounts.
- External functions supplied outside this repository require a narrowly documented exception rather than being assumed safe.

## #46 handoff

Issue #46 must run both static layers before runtime retirement:

```bash
npm run test:entry-points
npm run test:entry-point-callers
```

No runtime symbol should be removed while the caller checker reports an unresolved executable reference.

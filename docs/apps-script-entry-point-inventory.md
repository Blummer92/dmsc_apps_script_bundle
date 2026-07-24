# Apps Script deployable entry-point inventory

Issue: #45

## Purpose

The repository exposes top-level Apps Script functions as runtime entry points. Operator-side registries do not prevent a function from being run manually, referenced by a menu, or invoked by a trigger. The static checker in `scripts/check-apps-script-entry-points.mjs` inventories every `.gs` and script block in deployable `.html` source, records every declaration location, classifies each symbol, and fails unexplained duplicate declarations.

## Classification model

The policy file is `config/apps-script-entry-points.json`.

- `read_only`: approved public read path.
- `read_or_analysis`: read, preview, validation, inventory, or reporting path that still requires caller review.
- `mutation`: explicit governed mutation boundary.
- `mutation_or_manager`: likely write/manager path requiring authorization review.
- `development_test`: test helper that should not remain on the final live surface without an explicit reason.
- `retired`: known unsafe legacy entry point that #46 must remove or fail closed.
- `internal_helper`: underscore-suffixed helper that is not intended as an operator command.
- `manual_review`: deterministic fallback for symbols not covered by a safe rule. This is a classification, not approval.

Explicit classifications override name-based rules. A classification never proves runtime safety; it establishes review ownership and prevents silent additions.

## Confirmed duplicate declarations

The current source contains temporary duplicate exceptions for:

- `getDmscSourceApprovalPreviewBatch`
- `testGetDmscSourceApprovalPreviewBatch`

Both are declared more than once in `DMSC_SourceApproval.gs`. The checker records every path and line. The exceptions are temporary evidence only and must be removed when #46 resolves the runtime surface.

## Confirmed retirement candidates

- `testApproveDmscSourceForAssetRoundTrip`: selects the first available dashboard record and performs a live mutation/restore sequence.
- `repairDmscSourceApprovalRoundTripTarget`: contains a hard-coded target ID and performs writes.

#45 does not remove or rename either function. #46 owns runtime disposition after #41–#43 provide approved replacements.

## Running the checker

```bash
npm run test:entry-points
```

The command:

1. scans deployable `.gs` and `.html` sources;
2. writes `docs/apps-script-entry-point-inventory.json` with symbol, classification, and declaration locations;
3. fails unexplained duplicates;
4. runs focused checker tests.

The scan is credential-free and does not execute Apps Script source, access Google services, inspect live triggers, or make network requests.

## Caller and reference handoff

The generated inventory is the canonical symbol list for #46. #46 must pair it with repository searches of menus, UI strings, trigger documentation, and runbooks before removing a symbol. A compatibility wrapper may remain only when it fails closed before service access and names an approved replacement.

## Remaining limitations

The checker is static. It does not prove that a function is safe, that deployed triggers match repository source, or that no dynamic string-based caller exists. Those remain explicit review and later authorized-live-validation risks.

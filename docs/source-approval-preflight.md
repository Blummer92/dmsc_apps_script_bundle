# Source approval preflight contract

Issue: #40

## Boundary

`DMSC_SourceApprovalPreflight.gs` validates source-approval identity, destinations, schemas, proposed fields, original values, operation metadata, and lock ownership before any write.

It does not commit source values, append audit rows, flush, verify, or restore. Those steps remain #41.

## Canonical configuration

Only `DMSC_APP_CONFIG.auditLogSheetName` is valid. A configured `auditSheetName` property is treated as a blocking legacy path; there is no silent fallback.

The audit sheet must already exist and match this ordered schema:

1. Timestamp
2. Actor
3. Image Identity ID
4. Action
5. Field
6. Old Value
7. New Value
8. Source

Preflight does not create sheets or headers.

## Lock ownership

`withDmscSourceApprovalLock_()` acquires one script lock with a bounded timeout. It calls preflight while holding that lock and, only for a ready result, invokes the supplied callback while the same lock is still held. The outer helper releases once in `finally`.

#41 must place its commit, audit append, flush, verification, and compensating restoration inside that callback. Nested helpers must not acquire another script lock.

## Result states

- `READY_FOR_COMMIT`: all checks passed and original values were captured.
- `BLOCKED_BEFORE_WRITE`: one or more checks failed; write-evidence counters remain zero.

Both states include operation and target identity, destination names, headers, lock evidence, blockers/warnings, originals when available, and zero-write evidence.

## Blocking conditions

- missing or legacy audit configuration;
- missing explicit file ID, operation ID, actor, action, or source/reason;
- lock timeout or missing lock ownership;
- missing source or audit sheet;
- missing or duplicate required headers;
- audit schema order mismatch;
- unsupported proposed field;
- missing or duplicate exact `file_id` target;
- empty proposed update set.

## Validation

Focused tests load the production preflight source in the #13 Apps Script harness and verify ready-state originals, lock lifetime, missing destinations, malformed schema, timeout behavior, duplicate targets, lock release, and zero writes on blocked paths.

No live workbook, credential, Apps Script deployment, or external service is used.

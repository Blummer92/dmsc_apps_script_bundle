# Deployment and Write-Surface Safety Scope

## Objective

Prevent wrong-target Apps Script pushes and make every repository write surface visible before further automation expands.

## Issues

- #12 — Inventory Apps Script deployment targets and write surfaces
- #18 — Standardize project-specific clasp target safeguards

## Milestone A — Deployment and write-surface inventory

For each deployable project, record:

- project name and repository path
- manifest path
- source root
- clasp configuration pattern
- Script ID handling
- bound or standalone deployment type
- read systems
- write systems
- dry-run and staging behavior
- production-write behavior
- Apps Script-native tests
- mutation-bearing smoke tests
- owner and stop conditions

Classify functions as:

- read-only
- preview or dry-run
- configuration write
- staging write
- production write
- test mutation

## Milestone B — Clasp safeguards

Each deployable project should have a target-specific preflight path that validates:

- exact working directory
- expected Script ID
- expected `rootDir`
- expected manifest
- required source files
- ignored sibling projects
- `clasp status` before push
- `clasp status` after push

Local OAuth credentials and tokens must never enter GitHub. Script IDs are deployment identifiers, but their use still needs target controls.

## Required stop conditions

Stop before push when:

- the project folder is ambiguous;
- Script ID does not match the expected target;
- the manifest or required files are missing;
- sibling project files would be included;
- authorization for the target environment is unclear;
- rollback or smoke-test instructions are absent.

## Out of scope

- Executing live pushes without separate approval
- Combining deployment targets
- Changing OAuth scopes or sharing settings
- Modifying production records
- Introducing a universal push command

## Acceptance evidence

- Project/deployment matrix
- Function write-surface matrix
- Clasp configuration policy
- Preflight test results using safe local fixtures
- Wrong-directory and wrong-target failure tests
- Post-push checklist and rollback documentation

## Risks

A valid clasp command can still deploy the wrong source tree to the wrong Apps Script project. Correct target identity is more important than reducing the number of operator steps.

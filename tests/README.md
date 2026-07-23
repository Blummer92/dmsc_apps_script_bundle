# DMSC Dashboard test suite

The root test suite is credential-free and executes selected production Apps Script source under Node/Jest.

## Production-source harness

`tests/helpers/appsScriptHarness.js` loads real `.gs` files and JavaScript inside Apps Script HTML `<script>` blocks into a controlled Node `vm` context.

The harness separates:

1. source selection and deterministic file order;
2. Apps Script runtime doubles;
3. fixture state;
4. side-effect evidence;
5. failure injection;
6. test assertions.

It provides explicit doubles for:

- `SpreadsheetApp`;
- `PropertiesService`;
- `LockService`;
- `UrlFetchApp`;
- `Session`;
- `Utilities`;
- `Logger`;
- `HtmlService`.

Network access is blocked by default. A test must inject `fetchImpl` deliberately before `UrlFetchApp.fetch()` can return a value.

Unsupported or undeclared Apps Script globals fail with a normal reference error instead of silently returning a successful mock value.

## Current production-source coverage

The Phase 1 tests now load the repository implementations of:

- `updateDmscReviewMetadata()` and its helpers from `Code.gs`;
- `appendAuditEntry_()` from `Code.gs`;
- `escapeHtml()` from `DashboardJs.html`.

The tests no longer contain copied implementations of those functions.

A controlled source transform test changes the production allowlist inside the isolated VM and proves the metadata-update result changes. The repository file itself is never modified by that characterization test.

## Running tests

```bash
npm ci
npm test
npm run test:phase1
```

Additional safety checks:

```bash
npm run test:clasp-preflight
npm run test:validate-live
```

## Adding a production-source test

```javascript
const {
  createAppsScriptHarness,
  createAppsScriptRuntime,
  createSpreadsheetFixture
} = require('../helpers/appsScriptHarness.js');

const fixture = createSpreadsheetFixture({
  'Example Sheet': [['Header'], ['Value']]
});
const runtime = createAppsScriptRuntime({ spreadsheet: fixture.spreadsheet });
const harness = createAppsScriptHarness({ runtime });

harness.loadFiles(['Code.gs']);
const productionFunction = harness.getFunction('productionFunction');
```

Files are evaluated in the order supplied to `loadFiles()`. Later declarations replace earlier global declarations, matching the repository's deliberate bundle-order model. Tests that depend on multiple Apps Script files must state that order explicitly.

HTML files are loaded with `{ path: 'Client.html', html: true }`, which evaluates their `<script>` blocks. Required browser globals such as `document` must be injected explicitly.

## Fixture and evidence APIs

Stateful Spreadsheet fixtures expose:

- `__getRows()` for read-back assertions;
- `__getEvents()` for range and formatting evidence;
- `__getSheet(name)` for exact destination inspection.

The runtime exposes `getEvents(type)` for:

- Spreadsheet opens and flushes;
- Script Property reads/writes;
- lock acquisition/release;
- URL fetch attempts;
- sleeps;
- generated operation IDs;
- logger calls.

These capabilities support later offline work for Notion transport, source-audit recovery, Visual Asset Library write safety, and deployable entry-point checks.

## Limitations

The harness is not the Apps Script runtime. It does not prove OAuth scopes, trigger behavior, UI rendering, Google service latency, quota behavior, or external-system behavior. Those concerns require separately authorized staging validation.

Ordinary Jest and Cloud Build runs must not use credentials, execute Apps Script, call Notion, modify Sheets or Drive, or deploy with clasp.

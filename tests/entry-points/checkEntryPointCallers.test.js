'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const checker = require('../../scripts/apps-script-entry-point-callers.cjs');

const inventory = [
  { project: 'root-dashboard', symbol: 'safeHandler', classification: 'read_only' },
  { project: 'root-dashboard', symbol: 'retiredHandler', classification: 'retired' },
  { project: 'root-dashboard', symbol: 'directTarget', classification: 'mutation' }
];

const emptyPolicy = { schemaVersion: 1, temporaryReferenceExceptions: [], reviewedDynamicReferences: [] };

describe('Apps Script caller-reference checker', () => {
  test('detects menu literal handlers and multiple addItem calls', () => {
    const source = `
      SpreadsheetApp.getUi().createMenu('Tools')
        .addItem('Safe', 'safeHandler')
        .addItem('Retired', 'retiredHandler')
        .addToUi();
    `;
    expect(checker.discoverMenuCallers(source, 'Code.gs', 'root-dashboard').map((item) => item.symbol)).toEqual([
      'safeHandler',
      'retiredHandler'
    ]);
  });

  test('detects chained google.script.run member call', () => {
    const source = `
      google.script.run
        .withSuccessHandler(render)
        .withFailureHandler(showError)
        .safeHandler({ ok: true });
    `;
    expect(checker.discoverGoogleScriptRunCallers(source, 'Client.html', 'root-dashboard')).toEqual([
      expect.objectContaining({ symbol: 'safeHandler', callerType: 'html', invocationStyle: 'member-call' })
    ]);
  });

  test('does not classify nested success and failure handlers as server calls', () => {
    const source = `
      google.script.run
        .withSuccessHandler((value) => render(normalize(value)))
        .withFailureHandler((error) => showError(formatError(error)))
        .safeHandler({
          payload: buildPayload(getValue())
        });
    `;

    const results = checker.discoverGoogleScriptRunCallers(
      source,
      'Client.html',
      'root-dashboard'
    );

    expect(results).toEqual([
      expect.objectContaining({
        symbol: 'safeHandler',
        callerType: 'html',
        invocationStyle: 'member-call'
      })
    ]);

    expect(results.map((item) => item.symbol)).not.toContain(
      'withSuccessHandler'
    );

    expect(results.map((item) => item.symbol)).not.toContain(
      'withFailureHandler'
    );
  });

  test('detects literal and unresolved bracket dispatch separately', () => {
    const source = `
      google.script.run['safeHandler']();
      google.script.run[handlerName]();
    `;
    const results = checker.discoverGoogleScriptRunCallers(source, 'Client.html', 'root-dashboard');
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'safeHandler', invocationStyle: 'bracket-literal', dynamic: false }),
      expect.objectContaining({ symbol: '', invocationStyle: 'bracket-dynamic', dynamic: true, expression: 'handlerName' })
    ]));
  });

  test('detects direct calls but not declarations', () => {
    const source = `
      function directTarget(payload) { return payload; }
      function caller() { return directTarget({ ok: true }); }
    `;
    const results = checker.discoverDirectCalls(source, 'Code.gs', 'root-dashboard', new Set(['directTarget']));
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(expect.objectContaining({ symbol: 'directTarget', invocationStyle: 'direct-call' }));
  });

  test('does not treat comments as direct callers', () => {
    const source = `
      // directTarget();
      /* directTarget(); */
      function caller() { return true; }
    `;
    expect(checker.discoverDirectCalls(source, 'Code.gs', 'root-dashboard', new Set(['directTarget']))).toEqual([]);
  });

  test('detects registry entry points and blocked status', () => {
    const source = JSON.stringify({
      suites: {
        legacy: {
          target: 'root-dashboard',
          classification: 'blocked',
          entryPoint: 'retiredHandler'
        }
      }
    });
    expect(checker.discoverRegistryCallers(source, 'config/live-smoke-suites.json', 'root-dashboard')).toEqual([
      expect.objectContaining({
        symbol: 'retiredHandler',
        callerType: 'registry',
        executable: false,
        registryStatus: 'blocked'
      })
    ]);
  });

  test('distinguishes safety documentation from operator instructions', () => {
    const source = `
      retiredHandler is blocked and must not be executed.
      Operator: run safeHandler from the Apps Script editor.
    `;
    const results = checker.discoverDocumentationReferences(source, 'docs/runbook.md', inventory);
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'retiredHandler', invocationStyle: 'safety-warning', executable: false }),
      expect.objectContaining({ symbol: 'safeHandler', invocationStyle: 'operator-instruction', executable: true })
    ]));
  });

  test('retired executable reference fails', () => {
    const records = [{
      project: 'root-dashboard',
      symbol: 'retiredHandler',
      callerType: 'menu',
      file: 'Code.gs',
      line: 10,
      invocationStyle: 'string-handler',
      executable: true,
      dynamic: false
    }];
    expect(checker.evaluateCallers(records, inventory, emptyPolicy)).toEqual([
      expect.stringContaining('retired symbol root-dashboard:retiredHandler')
    ]);
  });

  test('approved temporary exception passes', () => {
    const records = [{
      project: 'root-dashboard',
      symbol: 'retiredHandler',
      callerType: 'direct-source',
      file: 'Legacy.gs',
      line: 4,
      invocationStyle: 'direct-call',
      executable: true,
      dynamic: false
    }];
    const policy = {
      temporaryReferenceExceptions: [{
        symbolKey: 'root-dashboard:retiredHandler',
        caller: 'Legacy.gs',
        callerType: 'direct-source',
        owner: 'issue-46',
        reason: 'Temporary legacy caller.',
        replacement: 'safeHandler',
        removalIssue: 46
      }],
      reviewedDynamicReferences: []
    };
    expect(checker.evaluateCallers(records, inventory, policy)).toEqual([]);
  });

  test('malformed exception fails validation', () => {
    expect(checker.validateCallerPolicy({ temporaryReferenceExceptions: [{ symbolKey: 'root-dashboard:retiredHandler' }] })).toEqual(
      expect.arrayContaining([expect.stringContaining('missing caller')])
    );
  });

  test('unknown executable symbol fails', () => {
    const records = [{
      project: 'root-dashboard',
      symbol: 'missingHandler',
      callerType: 'menu',
      file: 'Code.gs',
      line: 1,
      invocationStyle: 'string-handler',
      executable: true,
      dynamic: false
    }];
    expect(checker.evaluateCallers(records, inventory, emptyPolicy)).toEqual([
      expect.stringContaining('unknown symbol missingHandler')
    ]);
  });

  test('unreviewed dynamic reference fails', () => {
    const records = [{
      project: 'root-dashboard',
      symbol: '',
      callerType: 'dynamic-string',
      file: 'Client.html',
      line: 5,
      invocationStyle: 'bracket-dynamic',
      executable: true,
      dynamic: true,
      expression: 'handlerName'
    }];
    expect(checker.evaluateCallers(records, inventory, emptyPolicy)).toEqual([
      expect.stringContaining('unresolved dynamic Apps Script caller')
    ]);
  });

  test('trigger setup and simple handlers are reported', () => {
    const source = `
      ScriptApp.newTrigger('safeHandler').timeBased().everyHours(1).create();
      function onEdit(event) { return event; }
    `;
    expect(checker.discoverTriggerReferences(source, 'Triggers.gs', 'root-dashboard')).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: 'safeHandler', invocationStyle: 'ScriptApp.newTrigger' }),
      expect.objectContaining({ symbol: 'onEdit', invocationStyle: 'onEdit' })
    ]));
  });

  test('does not treat local HTML helpers as deployable direct-source callers', () => {
    const repositoryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'entry-point-callers-')
    );

    try {
      fs.writeFileSync(
        path.join(repositoryRoot, 'Client.html'),
        `
          <script>
            function escapeHtml(value) {
              return String(value);
            }

            const escaped = escapeHtml('example');

            google.script.run
              .withSuccessHandler(render)
              .safeHandler(escaped);
          </script>
        `
      );

      const entryPolicy = {
        projects: [
          {
            name: 'root-dashboard',
            root: '.',
            recursive: false
          }
        ]
      };

      const callerPolicy = {
        temporaryReferenceExceptions: [],
        reviewedDynamicReferences: []
      };

      const report = checker.buildCallerReport(
        repositoryRoot,
        entryPolicy,
        callerPolicy,
        [
          {
            project: 'root-dashboard',
            symbol: 'escapeHtml',
            classification: 'read_only'
          },
          {
            project: 'root-dashboard',
            symbol: 'safeHandler',
            classification: 'read_only'
          }
        ]
      );

      expect(report.callers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'safeHandler',
            callerType: 'html',
            invocationStyle: 'member-call'
          })
        ])
      );

      expect(report.callers).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'escapeHtml',
            callerType: 'direct-source'
          })
        ])
      );

      expect(report.errors).toEqual([]);
    } finally {
      fs.rmSync(repositoryRoot, {
        recursive: true,
        force: true
      });
    }
  });

  test('sorts callers after canonical project resolution', () => {
    const records = [
      {
        project: 'zz-alias',
        symbol: 'aHandler',
        callerType: 'registry',
        file: 'config/live-smoke-suites.json',
        line: 1,
        invocationStyle: 'json-entryPoint',
        executable: true,
        dynamic: false
      },
      {
        project: 'aa-alias',
        symbol: 'zHandler',
        callerType: 'registry',
        file: 'config/live-smoke-suites.json',
        line: 1,
        invocationStyle: 'json-entryPoint',
        executable: true,
        dynamic: false
      }
    ];

    const inventory = [
      {
        project: 'root-dashboard',
        symbol: 'aHandler',
        classification: 'read_only'
      },
      {
        project: 'root-dashboard',
        symbol: 'zHandler',
        classification: 'read_only'
      }
    ];

    expect(
      checker.evaluateCallers(
        records,
        inventory,
        {
          temporaryReferenceExceptions: [],
          reviewedDynamicReferences: []
        }
      )
    ).toEqual([]);

    const sorted = checker.dedupeAndSort(records);

    expect(
      sorted.map((item) => `${item.project}:${item.symbol}`)
    ).toEqual([
      'root-dashboard:aHandler',
      'root-dashboard:zHandler'
    ]);
  });

  test('deduplicates caller rows and sorts deterministically', () => {
    const row = {
      project: 'root-dashboard',
      symbol: 'safeHandler',
      callerType: 'menu',
      file: 'Code.gs',
      line: 2,
      invocationStyle: 'string-handler'
    };
    const other = { ...row, symbol: 'directTarget', line: 1 };
    const result = checker.dedupeAndSort([row, row, other]);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.symbol)).toEqual(['directTarget', 'safeHandler']);
  });
});

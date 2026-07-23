'use strict';

const { createAppsScriptHarness } = require('../helpers/appsScriptHarness.js');

function loadEscapeHtml() {
  const harness = createAppsScriptHarness({
    globals: {
      document: { addEventListener: jest.fn() },
      google: { script: { run: {} } },
      window: { setTimeout: jest.fn(), open: jest.fn() }
    }
  });
  harness.loadFiles([{ path: 'DashboardJs.html', html: true }]);
  return { harness, escapeHtml: harness.getFunction('escapeHtml') };
}

describe('escapeHtml() production source', () => {
  test.each([
    ['<div>', '&lt;div&gt;'],
    ['A & B', 'A &amp; B'],
    ['He said "hello"', 'He said &quot;hello&quot;'],
    ["It's a test", 'It&#039;s a test'],
    [null, ''],
    [undefined, ''],
    [123, '123']
  ])('escapes %p as %p', (input, expected) => {
    const { escapeHtml } = loadEscapeHtml();
    expect(escapeHtml(input)).toBe(expected);
  });

  test('prevents script and event-handler markup from remaining executable', () => {
    const { escapeHtml } = loadEscapeHtml();
    const escaped = escapeHtml('<img src=x onerror="alert(1)"><script>alert(2)</script>');

    expect(escaped).not.toContain('<img');
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;img');
    expect(escaped).toContain('&lt;script&gt;');
  });

  test('loads the function from DashboardJs.html rather than a copied test implementation', () => {
    const { harness } = loadEscapeHtml();

    expect(harness.getLoadedFiles()).toEqual([
      expect.objectContaining({ path: 'DashboardJs.html' })
    ]);
    expect(harness.listFunctions()).toContain('escapeHtml');
  });
});

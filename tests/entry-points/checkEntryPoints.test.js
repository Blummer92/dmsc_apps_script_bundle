'use strict';

const checker = require('../../scripts/apps-script-entry-point-checker.cjs');

describe('Apps Script entry-point checker', () => {
  test('detects duplicate top-level declarations with project and locations', () => {
    const source = 'function example() {}\nfunction example() {}\n';
    const declarations = checker.discoverDeclarations(source, 'Example.gs', 'root-dashboard');
    expect(declarations).toEqual([
      { symbol: 'example', project: 'root-dashboard', file: 'Example.gs', line: 1 },
      { symbol: 'example', project: 'root-dashboard', file: 'Example.gs', line: 2 }
    ]);
  });

  test('ignores nested declarations and function text inside comments or strings', () => {
    const source = `
      // function commentedOut() {}
      const text = 'function stringValue() {}';
      function publicCommand() {
        function nestedHelper() {}
      }
    `;
    expect(checker.discoverDeclarations(source, 'Example.gs', 'root-dashboard')).toEqual([
      { symbol: 'publicCommand', project: 'root-dashboard', file: 'Example.gs', line: 4 }
    ]);
  });

  test('classifies explicit high-risk functions before heuristics', () => {
    const policy = {
      explicitClassifications: { repairThing: 'retired' },
      classificationRules: [{ pattern: '^repair', classification: 'mutation_or_manager' }]
    };
    expect(checker.classifySymbol('repairThing', policy)).toBe('retired');
  });

  test('routes unmatched globals to manual review', () => {
    const policy = { explicitClassifications: {}, classificationRules: [] };
    expect(checker.classifySymbol('mysteryCommand', policy)).toBe('manual_review');
  });

  test('fails unexplained same-project duplicates but allows documented exceptions', () => {
    expect(checker.evaluateInventory([{
      project: 'root-dashboard',
      symbol: 'duplicate',
      classification: 'manual_review',
      declarations: [
        { project: 'root-dashboard', file: 'A.gs', line: 1 },
        { project: 'root-dashboard', file: 'B.gs', line: 2 }
      ],
      duplicate: true,
      temporaryDuplicateException: ''
    }])).toHaveLength(1);

    expect(checker.evaluateInventory([{
      project: 'root-dashboard',
      symbol: 'duplicate',
      classification: 'manual_review',
      declarations: [
        { project: 'root-dashboard', file: 'A.gs', line: 1 },
        { project: 'root-dashboard', file: 'B.gs', line: 2 }
      ],
      duplicate: true,
      temporaryDuplicateException: 'Tracked for removal.'
    }])).toEqual([]);
  });
});

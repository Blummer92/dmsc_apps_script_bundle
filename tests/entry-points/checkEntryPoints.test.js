'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

let checker;

beforeAll(async () => {
  checker = await import(pathToFileURL(path.resolve(__dirname, '..', '..', 'scripts/check-apps-script-entry-points.mjs')).href);
});

describe('Apps Script entry-point checker', () => {
  test('detects duplicate declarations with locations', () => {
    const source = 'function example() {}\nfunction example() {}\n';
    const declarations = checker.discoverDeclarations(source, 'Example.gs');
    expect(declarations).toEqual([
      { symbol: 'example', file: 'Example.gs', line: 1 },
      { symbol: 'example', file: 'Example.gs', line: 2 }
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

  test('fails unexplained duplicates but allows documented temporary exceptions', () => {
    expect(checker.evaluateInventory([{
      symbol: 'duplicate',
      classification: 'manual_review',
      declarations: [{ file: 'A.gs', line: 1 }, { file: 'B.gs', line: 2 }],
      duplicate: true,
      temporaryDuplicateException: ''
    }])).toHaveLength(1);

    expect(checker.evaluateInventory([{
      symbol: 'duplicate',
      classification: 'manual_review',
      declarations: [{ file: 'A.gs', line: 1 }, { file: 'B.gs', line: 2 }],
      duplicate: true,
      temporaryDuplicateException: 'Tracked for removal.'
    }])).toEqual([]);
  });
});

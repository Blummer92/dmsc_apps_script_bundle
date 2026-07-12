#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const SERVICE_PATH = './drive-metadata-dashboard/src/ControlledVocabularyService.gs';
const serviceSource = readFileSync(SERVICE_PATH, 'utf8');

function loadService() {
  const sandbox = {
    console: { log: () => {}, error: () => {} },
    JSON: JSON
  };
  const context = createContext(sandbox);
  runInContext(serviceSource, context, { timeout: 1000 });
  return context.ControlledVocabularyService;
}

const ControlledVocabularyService = loadService();

// Test corpus for all four vocabularies
const testCases = {
  'Asset type': [
    // Exact matches (should pass through)
    { input: 'icon', expectedViaMap: 'icon', expectedViaFlat: 'icon' },
    { input: 'diagram', expectedViaMap: 'diagram', expectedViaFlat: 'diagram' },
    { input: 'worksheet image', expectedViaMap: 'worksheet image', expectedViaFlat: 'worksheet image' },
    { input: 'slide image', expectedViaMap: 'slide image', expectedViaFlat: 'slide image' },
    { input: 'process visual', expectedViaMap: 'process visual', expectedViaFlat: 'process visual' },
    { input: 'poster visual', expectedViaMap: 'poster visual', expectedViaFlat: 'poster visual' },
    // Aliases from all three original implementations
    { input: 'icons', expectedViaMap: 'icon', expectedViaFlat: 'icon' },
    { input: 'prop', expectedViaMap: 'poster visual', expectedViaFlat: 'poster visual' },
    { input: 'product', expectedViaMap: 'poster visual', expectedViaFlat: 'poster visual' },
    { input: 'ui_screenshot', expectedViaMap: 'slide image', expectedViaFlat: 'slide image' },
    { input: 'logo', expectedViaMap: 'poster visual', expectedViaFlat: 'poster visual' },
    { input: 'interface', expectedViaMap: 'process visual', expectedViaFlat: 'process visual' },
    // Unmapped (should fail)
    { input: 'unknown_type', expectedViaMap: null, expectedViaFlat: null }
  ],
  'Approved use': [
    { input: 'worksheet', expectedViaMap: 'worksheet', expectedViaFlat: 'worksheet' },
    { input: 'slide', expectedViaMap: 'slide', expectedViaFlat: 'slide' },
    { input: 'poster', expectedViaMap: 'poster', expectedViaFlat: 'poster' },
    { input: 'student-facing', expectedViaMap: 'student-facing', expectedViaFlat: 'student-facing' },
    { input: 'teacher-facing', expectedViaMap: 'teacher-facing', expectedViaFlat: 'teacher-facing' },
    { input: 'worksheets', expectedViaMap: 'worksheet', expectedViaFlat: 'worksheet' },
    { input: 'student_facing', expectedViaMap: 'student-facing', expectedViaFlat: 'student-facing' },
    { input: 'unknown_use', expectedViaMap: null, expectedViaFlat: null }
  ],
  'Reuse status': [
    { input: 'approved', expectedViaMap: 'approved', expectedViaFlat: 'approved' },
    { input: 'draft', expectedViaMap: 'draft', expectedViaFlat: 'draft' },
    { input: 'needs revision', expectedViaMap: 'needs revision', expectedViaFlat: 'needs revision' },
    { input: 'retired', expectedViaMap: 'retired', expectedViaFlat: 'retired' },
    { input: 'needs_revision', expectedViaMap: 'needs revision', expectedViaFlat: 'needs revision' },
    { input: 'source_approved', expectedViaMap: 'approved', expectedViaFlat: 'approved' },
    { input: 'unknown_status', expectedViaMap: null, expectedViaFlat: null }
  ],
  'Cognitive load rating': [
    { input: 'low', expectedViaMap: 'low', expectedViaFlat: 'low' },
    { input: 'medium', expectedViaMap: 'medium', expectedViaFlat: 'medium' },
    { input: 'high', expectedViaMap: 'high', expectedViaFlat: 'high' },
    { input: 'med', expectedViaMap: 'medium', expectedViaFlat: 'medium' },
    { input: 'unknown_load', expectedViaMap: null, expectedViaFlat: null }
  ]
};

const failures = [];
const passes = [];

function assertBehavior(fieldName, testCase) {
  // Test map() with no schema (defaults to APPROVED_OPTIONS)
  const mapResult = ControlledVocabularyService.map(fieldName, testCase.input, null);
  const mapValue = mapResult.ok ? mapResult.value : null;
  if (mapValue !== testCase.expectedViaMap) {
    failures.push(`map('${fieldName}', '${testCase.input}'): expected '${testCase.expectedViaMap}', got '${mapValue}'`);
  } else {
    passes.push(`map('${fieldName}', '${testCase.input}') → '${mapValue}'`);
  }

  // Test normalizeFlat()
  const flatResult = ControlledVocabularyService.normalizeFlat(fieldName, testCase.input);
  const flatValue = flatResult.value || null;
  if (flatValue !== testCase.expectedViaFlat) {
    failures.push(`normalizeFlat('${fieldName}', '${testCase.input}'): expected '${testCase.expectedViaFlat}', got '${flatValue}'`);
  } else {
    passes.push(`normalizeFlat('${fieldName}', '${testCase.input}') → '${flatValue}'`);
  }
}

// Run all tests
Object.keys(testCases).forEach(fieldName => {
  testCases[fieldName].forEach(testCase => {
    assertBehavior(fieldName, testCase);
  });
});

// Print results
console.log('\n========== Differential Verification ==========\n');
console.log(`Passed: ${passes.length}`);
if (passes.length <= 20) {
  passes.forEach(p => console.log(`  ✓ ${p}`));
} else {
  passes.slice(0, 10).forEach(p => console.log(`  ✓ ${p}`));
  console.log(`  ... and ${passes.length - 10} more`);
}

if (failures.length) {
  console.log(`\nFailed: ${failures.length}`);
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log('\n✓ All differential checks passed');
  console.log(`Total: ${passes.length} assertions verified`);
  process.exit(0);
}

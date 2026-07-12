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
const failures = [];
const passes = [];

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  } else {
    passes.push(message);
  }
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Got: ${JSON.stringify(actual)}`);
  } else {
    passes.push(message);
  }
}

// Test suite: Asset Type mapping
function testAssetTypeExactMatch() {
  const result = ControlledVocabularyService.map('Asset type', 'icon', null);
  assertEqual(result, { ok: true, value: 'icon', source: 'icon', reason: '' }, 'Asset type exact match');
}

function testAssetTypeAliasHit() {
  const result = ControlledVocabularyService.map('Asset type', 'icons', null);
  assertEqual(result, { ok: true, value: 'icon', source: 'icons', reason: '' }, 'Asset type alias hit');
}

function testAssetTypeUnmapped() {
  const result = ControlledVocabularyService.map('Asset type', 'unknown_type', null);
  assert(result.ok === false, 'Asset type unmapped returns ok: false');
  assert(result.value === '', 'Asset type unmapped returns empty value');
  assert(result.reason.includes('No approved Notion'), 'Asset type unmapped has reason');
}

function testAssetTypeBlank() {
  const result = ControlledVocabularyService.map('Asset type', '', null);
  assertEqual(result, { ok: false, value: '', source: '', reason: 'Asset type source value is blank.' }, 'Asset type blank input');
}

function testAssetTypeSchemaAware() {
  const schema = {
    type: 'select',
    select: {
      options: [
        { name: 'process visual' },
        { name: 'slide image' }
      ]
    }
  };
  const result = ControlledVocabularyService.map('Asset type', 'prop', schema);
  assert(result.ok === true, 'Asset type schema-aware returns ok: true');
  assert(['process visual', 'slide image'].includes(result.value), 'Asset type schema-aware picks from ranked candidates');
}

function testAssetTypeRankedFallback() {
  const schema = {
    type: 'select',
    select: {
      options: [
        { name: 'slide image' },
        { name: 'worksheet image' }
      ]
    }
  };
  const result = ControlledVocabularyService.map('Asset type', 'prop', schema);
  assert(result.ok === true, 'Asset type ranked fallback succeeds');
  assert(result.value === 'slide image', 'Asset type ranked fallback picks second candidate (first not in schema)');
}

function testAssetTypeLooseNormalize() {
  const schema = {
    type: 'select',
    select: {
      options: [
        { name: 'process visual' }
      ]
    }
  };
  const result = ControlledVocabularyService.map('Asset type', 'Process Visual', schema);
  assert(result.ok === true, 'Asset type loose normalize succeeds');
  assert(result.value === 'process visual', 'Asset type loose normalize matches case-insensitively');
}

// Test suite: normalizeFlat for all vocabs
function testNormalizeFlatAssetType() {
  const result = ControlledVocabularyService.normalizeFlat('Asset type', 'icons');
  assertEqual(result, { value: 'icon', reason: '' }, 'normalizeFlat Asset type alias');
}

function testNormalizeFlatApprovedUse() {
  const result = ControlledVocabularyService.normalizeFlat('Approved use', 'worksheets');
  assertEqual(result, { value: 'worksheet', reason: '' }, 'normalizeFlat Approved use alias');
}

function testNormalizeFlatReuseStatus() {
  const result = ControlledVocabularyService.normalizeFlat('Reuse status', 'needs_revision');
  assertEqual(result, { value: 'needs revision', reason: '' }, 'normalizeFlat Reuse status alias');
}

function testNormalizeFlatCognitiveLoad() {
  const result = ControlledVocabularyService.normalizeFlat('Cognitive load rating', 'med');
  assertEqual(result, { value: 'medium', reason: '' }, 'normalizeFlat Cognitive load alias');
}

function testNormalizeFlatExactMatch() {
  const result = ControlledVocabularyService.normalizeFlat('Asset type', 'diagram');
  assertEqual(result, { value: 'diagram', reason: '' }, 'normalizeFlat exact match');
}

function testNormalizeFlatUnmapped() {
  const result = ControlledVocabularyService.normalizeFlat('Asset type', 'unknown');
  assertEqual(result, { value: '', reason: 'source value is outside approved options: unknown' }, 'normalizeFlat unmapped');
}

function testNormalizeFlatBlank() {
  const result = ControlledVocabularyService.normalizeFlat('Asset type', '');
  assertEqual(result, { value: '', reason: 'no reviewed source value available' }, 'normalizeFlat blank');
}

// Test suite: approvedOptions
function testApprovedOptionsAssetType() {
  const result = ControlledVocabularyService.approvedOptions('Asset type');
  assertEqual(result, ['icon', 'diagram', 'worksheet image', 'slide image', 'process visual', 'poster visual'], 'approvedOptions Asset type');
}

function testApprovedOptionsApprovedUse() {
  const result = ControlledVocabularyService.approvedOptions('Approved use');
  assertEqual(result, ['worksheet', 'slide', 'poster', 'student-facing', 'teacher-facing'], 'approvedOptions Approved use');
}

function testApprovedOptionsReuseStatus() {
  const result = ControlledVocabularyService.approvedOptions('Reuse status');
  assertEqual(result, ['approved', 'draft', 'needs revision', 'retired'], 'approvedOptions Reuse status');
}

function testApprovedOptionsCognitiveLoad() {
  const result = ControlledVocabularyService.approvedOptions('Cognitive load rating');
  assertEqual(result, ['low', 'medium', 'high'], 'approvedOptions Cognitive load');
}

function testApprovedOptionsUnknown() {
  const result = ControlledVocabularyService.approvedOptions('Unknown field');
  assertEqual(result, [], 'approvedOptions unknown field returns empty array');
}

// Test suite: Behavior parity with old implementations
function testAssetTypeB5Aliases() {
  // B had extra keys like product, visual_asset, background
  const result = ControlledVocabularyService.map('Asset type', 'product', null);
  assert(result.ok === true, 'Asset type B alias "product" now in shared service');
}

function testAssetTypeC12Keys() {
  // C had a strict subset; now A's full table is used
  const result = ControlledVocabularyService.map('Asset type', 'logo', null);
  assert(result.ok === true, 'Asset type logo (not in C, only in A) now maps');
  assert(result.value === 'poster visual', 'Asset type logo maps to poster visual');
}

function testAssetTypeInterfaceMaps() {
  const result = ControlledVocabularyService.map('Asset type', 'interface', null);
  assert(result.ok === true, 'Asset type interface maps');
}

function testAssetTypeMockupMaps() {
  const result = ControlledVocabularyService.map('Asset type', 'mockup', null);
  assert(result.ok === true, 'Asset type mockup maps');
}

function testAssetTypeReferenceMaps() {
  const result = ControlledVocabularyService.map('Asset type', 'reference', null);
  assert(result.ok === true, 'Asset type reference maps');
}

// Run all tests
const allTests = [
  testAssetTypeExactMatch,
  testAssetTypeAliasHit,
  testAssetTypeUnmapped,
  testAssetTypeBlank,
  testAssetTypeSchemaAware,
  testAssetTypeRankedFallback,
  testAssetTypeLooseNormalize,
  testNormalizeFlatAssetType,
  testNormalizeFlatApprovedUse,
  testNormalizeFlatReuseStatus,
  testNormalizeFlatCognitiveLoad,
  testNormalizeFlatExactMatch,
  testNormalizeFlatUnmapped,
  testNormalizeFlatBlank,
  testApprovedOptionsAssetType,
  testApprovedOptionsApprovedUse,
  testApprovedOptionsReuseStatus,
  testApprovedOptionsCognitiveLoad,
  testApprovedOptionsUnknown,
  testAssetTypeB5Aliases,
  testAssetTypeC12Keys,
  testAssetTypeInterfaceMaps,
  testAssetTypeMockupMaps,
  testAssetTypeReferenceMaps
];

allTests.forEach(test => {
  try {
    test();
  } catch (error) {
    failures.push(`Test ${test.name} threw error: ${error.message}`);
  }
});

// Print results
console.log('\n========== ControlledVocabularyService Tests ==========\n');
console.log(`Passed: ${passes.length}`);
passes.forEach(p => console.log(`  ✓ ${p}`));

if (failures.length) {
  console.log(`\nFailed: ${failures.length}`);
  failures.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log('\n✓ All tests passed');
  process.exit(0);
}

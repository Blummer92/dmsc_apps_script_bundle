# DMSC Dashboard Test Suite

Automated tests for the Digital Media Source Control Dashboard backend and frontend.

## Overview

This project implements a phased testing approach, starting with critical functions (Phase 1) and expanding to cover all major functionality.

**Current Phase: Phase 1 - Critical Functions**
- `updateDmscReviewMetadata()` - Data mutation and validation
- `appendAuditEntry_()` - Audit logging and compliance
- `escapeHtml()` - XSS prevention (security)

## Getting Started

### Installation

```bash
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-run on file changes)
npm run test:watch

# Run Phase 1 tests only
npm run test:phase1

# Generate coverage report
npm run test:coverage
```

## Test Structure

```
tests/
├── README.md                           # This file
├── setup.js                            # Global test setup, mocks Apps Script APIs
├── fixtures/
│   └── mockSheetData.js               # Mock data and helper functions
├── phase1/
│   ├── escapeHtml.test.js             # Security: XSS prevention
│   ├── appendAuditEntry.test.js       # Compliance: Audit logging
│   └── updateDmscReviewMetadata.test.js # Data mutation validation
├── phase2/                            # (Coming next)
│   ├── filterRecords.test.js
│   ├── getDmscDashboardRows.test.js
│   ├── matchesQueue.test.js
│   └── getDmscDashboardSummary.test.js
└── phase3/                            # (Coming later)
    ├── renderRows.test.js
    ├── renderQueues.test.js
    └── stateManagement.test.js
```

## Phase 1 Test Details

### 1. escapeHtml() Tests (26 test cases)

**Purpose:** Prevent XSS injection attacks by verifying HTML entity escaping.

**Coverage:**
- Basic HTML escaping (< > & " ')
- Script injection prevention
- Event handler injection prevention
- Edge cases (null, undefined, empty, numeric)
- Real-world scenarios (filenames, paths, user input)

**To run:**
```bash
npm test -- escapeHtml.test.js
```

### 2. appendAuditEntry_() Tests (18 test cases)

**Purpose:** Verify audit log integrity, compliance, and accountability tracking.

**Coverage:**
- Valid entry creation with changes
- Multiple changes logging
- SYSTEM actor for automated actions
- Empty/null changes handling
- Audit sheet auto-creation
- Timestamp and data preservation
- Compliance requirements (Image ID tracking, action recording, non-skippable entries)

**To run:**
```bash
npm test -- appendAuditEntry.test.js
```

### 3. updateDmscReviewMetadata() Tests (27 test cases)

**Purpose:** Verify safe updates to metadata with proper validation and change tracking.

**Coverage:**
- Input validation (missing IDs, records not found)
- Safe header enforcement (security - prevents editing unsafe fields)
- Multiple simultaneous updates
- Change detection (only report actual changes)
- Value handling (null, undefined, numeric, string)
- Return value structure
- Sheet write operations
- Partial updates

**To run:**
```bash
npm test -- updateDmscReviewMetadata.test.js
```

## Mock Data

The test suite includes fixtures for common data:

```javascript
import { 
  MOCK_HEADERS,
  MOCK_REGISTRY_ROWS,
  MOCK_AUDIT_LOG_DATA,
  createMockSheet,
  createMockSpreadsheet,
  createUpdatePayload
} from '../fixtures/mockSheetData.js';
```

### Available Fixtures

- **MOCK_HEADERS** - Column headers from the registry sheet
- **MOCK_REGISTRY_ROWS** - Sample data rows (3 records)
- **MOCK_AUDIT_LOG_DATA** - Sample audit log entries
- **createMockSheet(name, data)** - Factory for mock sheet objects
- **createMockSpreadsheet(sheets)** - Factory for mock spreadsheet objects
- **createUpdatePayload(imageIdentityId, updates)** - Factory for update payloads

## Coverage Goals

| Component | Target | Phase |
|-----------|--------|-------|
| Security functions | 100% | 1 |
| Data mutations | 100% | 1 |
| Filtering & sorting | 90% | 2 |
| UI rendering | 70% | 3 |
| **Overall backend** | 90% | 1-2 |
| **Overall frontend** | 65% | 3 |

## Writing New Tests

### 1. Create a test file

```javascript
// tests/phase1/myFunction.test.js
import { createMockSheet } from '../fixtures/mockSheetData.js';

describe('myFunction()', () => {
  let mockSheet;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSheet = createMockSheet();
  });

  test('does something', () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### 2. Use fixtures for mock data

```javascript
const mockSpreadsheet = createMockSpreadsheet({
  'My Sheet': createMockSheet('My Sheet', customData)
});
```

### 3. Clear mocks between tests

```javascript
beforeEach(() => {
  jest.clearAllMocks();
});
```

## Debugging Tests

### Run a single test

```bash
npm test -- --testNamePattern="escapes < character"
```

### Run with verbose output

```bash
npm test -- --verbose
```

### Watch a specific file

```bash
npm test -- --watch escapeHtml.test.js
```

## Common Issues

### "ReferenceError: SpreadsheetApp is not defined"

The setup.js file should be loaded automatically. Check that `jest.config.setupFilesAfterEnv` points to `tests/setup.js`.

### Mock not being called

Reset mocks in beforeEach:
```javascript
beforeEach(() => {
  jest.clearAllMocks();
});
```

### Tests failing with "undefined is not a function"

Ensure the implementation function is imported or defined in the test file.

## Next Steps

After Phase 1 is complete and passing:

1. **Phase 2** - Filtering, pagination, queue matching (5-7 days)
2. **Phase 3** - Frontend rendering and state management (6-8 days)
3. **Phase 4** - Edge cases, integration, CI/CD (3-5 days)

Track progress in the [Test Coverage Analysis](../test-coverage-analysis.html).

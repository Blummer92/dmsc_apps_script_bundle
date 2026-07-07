/**
 * Mock sheet data and helper functions for testing
 */

const MOCK_HEADERS = [
  'Image Identity ID',
  'File ID',
  'Filename',
  'Human Review Required',
  'Review Reason',
  'Next Owner',
  'Notes',
  'Metadata Classification Status',
  'Last Metadata Sync Timestamp',
  'Source Verification Status',
  'Prompt Evidence Status'
];

const MOCK_REGISTRY_ROWS = [
  [
    'id-001',
    'file-abc123',
    'photo-spring.jpg',
    'No',
    '',
    'Content Team',
    'Good source',
    'Approved',
    '2024-01-10T14:30:00Z',
    'Verified',
    'Strong Evidence'
  ],
  [
    'id-002',
    'file-def456',
    'diagram-arch.png',
    'Yes',
    'Needs source verification',
    'Source Authority Agent',
    '',
    'Pending Review',
    '2024-01-12T09:15:00Z',
    'Unverified',
    'No Prompt Evidence'
  ],
  [
    'id-003',
    'file-ghi789',
    'screenshot-ui.png',
    'No',
    '',
    'Visual Asset Director',
    'Duplicate of id-001',
    'Approved',
    '2024-01-11T16:45:00Z',
    'Verified',
    'Weak Evidence'
  ]
];

const MOCK_AUDIT_LOG_DATA = [
  ['Image Identity ID', 'Action', 'Timestamp', 'Actor', 'Source', 'Field', 'Old Value', 'New Value'],
  [
    'id-001',
    'Human Review Routing Update',
    '2024-01-10T12:00:00Z',
    'user@example.com',
    'Dashboard UI',
    'Review Reason',
    '',
    'Initial review needed'
  ]
];

/**
 * Creates a mock sheet object with common methods
 */
function createMockSheet(name = 'Merged Image Prompt Metadata', data = null) {
  const sheetData = data || [MOCK_HEADERS, ...MOCK_REGISTRY_ROWS];

  return {
    getName: jest.fn(() => name),
    getSheetId: jest.fn(() => 123456),
    getDataRange: jest.fn(() => ({
      getValues: jest.fn(() => sheetData)
    })),
    getRange: jest.fn((row, col) => ({
      getDisplayValue: jest.fn(() => sheetData[row - 1]?.[col - 1] || ''),
      getValue: jest.fn(() => sheetData[row - 1]?.[col - 1] || ''),
      setValue: jest.fn()
    })),
    appendRow: jest.fn(),
    insertSheet: jest.fn(function() { return this; }),
    getLastRow: jest.fn(() => sheetData.length)
  };
}

/**
 * Creates a mock spreadsheet object
 */
function createMockSpreadsheet(sheets = {}) {
  const defaultSheets = {
    'Merged Image Prompt Metadata': createMockSheet('Merged Image Prompt Metadata'),
    'DMSC Audit Log': createMockSheet('DMSC Audit Log', MOCK_AUDIT_LOG_DATA)
  };

  const allSheets = { ...defaultSheets, ...sheets };

  return {
    getUrl: jest.fn(() => 'https://docs.google.com/spreadsheets/d/1S3GNwqu0ehPXUA1j4FEksH1uEMKlxyEwAZWfIADPfpo/edit'),
    getSheetByName: jest.fn((name) => allSheets[name] || null),
    insertSheet: jest.fn((name) => {
      const newSheet = createMockSheet(name);
      allSheets[name] = newSheet;
      return newSheet;
    }),
    getSheets: jest.fn(() => Object.values(allSheets))
  };
}

/**
 * Helper to create a test update payload
 */
function createUpdatePayload(imageIdentityId, updates = {}) {
  return {
    imageIdentityId,
    updates: {
      'Human Review Required': 'Yes',
      'Review Reason': 'Needs verification',
      'Next Owner': 'Source Authority Agent',
      'Notes': 'Test update',
      ...updates
    }
  };
}

module.exports = {
  MOCK_HEADERS,
  MOCK_REGISTRY_ROWS,
  MOCK_AUDIT_LOG_DATA,
  createMockSheet,
  createMockSpreadsheet,
  createUpdatePayload
};

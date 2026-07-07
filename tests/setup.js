/**
 * Global test setup for DMSC Dashboard tests
 * Mocks Apps Script APIs and provides common utilities
 */

// Mock Apps Script global APIs
global.SpreadsheetApp = {
  openById: jest.fn(),
  getUi: jest.fn(),
};

global.HtmlService = {
  createTemplateFromFile: jest.fn(),
  createHtmlOutputFromFile: jest.fn(),
};

// Mock Date for audit logging tests
const originalDate = Date;
global.Date = class extends originalDate {
  constructor() {
    super();
    return new originalDate('2024-01-15T10:30:00Z');
  }

  static now() {
    return originalDate.parse('2024-01-15T10:30:00Z');
  }
};

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function cloneRows(rows) {
  return (rows || []).map((row) => Array.isArray(row) ? row.slice() : []);
}

function toDisplayValue(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function createSheetFixture(name, initialRows = []) {
  const rows = cloneRows(initialRows);
  const events = [];
  let frozenRows = 0;

  function ensureCell(row, column) {
    while (rows.length < row) rows.push([]);
    while (rows[row - 1].length < column) rows[row - 1].push('');
  }

  function readRange(row, column, numRows = 1, numColumns = 1) {
    const result = [];
    for (let rowOffset = 0; rowOffset < numRows; rowOffset += 1) {
      const resultRow = [];
      for (let columnOffset = 0; columnOffset < numColumns; columnOffset += 1) {
        resultRow.push(rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? '');
      }
      result.push(resultRow);
    }
    return result;
  }

  function writeRange(row, column, values) {
    values.forEach((valueRow, rowOffset) => {
      valueRow.forEach((value, columnOffset) => {
        ensureCell(row + rowOffset, column + columnOffset);
        rows[row - 1 + rowOffset][column - 1 + columnOffset] = value;
      });
    });
  }

  function getRange(row, column, numRows = 1, numColumns = 1) {
    const range = {
      getValue() {
        return readRange(row, column, 1, 1)[0][0];
      },
      getDisplayValue() {
        return toDisplayValue(readRange(row, column, 1, 1)[0][0]);
      },
      getValues() {
        return readRange(row, column, numRows, numColumns);
      },
      getDisplayValues() {
        return readRange(row, column, numRows, numColumns)
          .map((valueRow) => valueRow.map(toDisplayValue));
      },
      setValue(value) {
        writeRange(row, column, [[value]]);
        events.push({ type: 'range.setValue', row, column, value });
        return range;
      },
      setValues(values) {
        if (!Array.isArray(values) || values.length !== numRows) {
          throw new Error(`setValues row count mismatch for ${name}.`);
        }
        values.forEach((valueRow) => {
          if (!Array.isArray(valueRow) || valueRow.length !== numColumns) {
            throw new Error(`setValues column count mismatch for ${name}.`);
          }
        });
        writeRange(row, column, values);
        events.push({
          type: 'range.setValues',
          row,
          column,
          numRows,
          numColumns,
          values: cloneRows(values)
        });
        return range;
      },
      setFontWeight(value) {
        events.push({ type: 'range.setFontWeight', row, column, value });
        return range;
      },
      setBackground(value) {
        events.push({ type: 'range.setBackground', row, column, value });
        return range;
      },
      setNote(value) {
        events.push({ type: 'range.setNote', row, column, value });
        return range;
      }
    };
    return range;
  }

  const sheet = {
    getName: () => name,
    getSheetId: () => 123456,
    getDataRange() {
      return {
        getValues: () => cloneRows(rows),
        getDisplayValues: () => cloneRows(rows).map((row) => row.map(toDisplayValue))
      };
    },
    getRange,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((maximum, row) => Math.max(maximum, row.length), 0),
    appendRow(values) {
      rows.push(Array.isArray(values) ? values.slice() : []);
      events.push({ type: 'sheet.appendRow', values: Array.isArray(values) ? values.slice() : [] });
      return sheet;
    },
    setFrozenRows(value) {
      frozenRows = value;
      events.push({ type: 'sheet.setFrozenRows', value });
      return sheet;
    },
    __getRows: () => cloneRows(rows),
    __getEvents: () => events.slice(),
    __getFrozenRows: () => frozenRows
  };

  return sheet;
}

function createSpreadsheetFixture(sheetDefinitions = {}, options = {}) {
  const sheets = new Map();
  const events = [];

  Object.entries(sheetDefinitions).forEach(([name, definition]) => {
    sheets.set(name, definition && typeof definition.getRange === 'function'
      ? definition
      : createSheetFixture(name, definition));
  });

  const spreadsheet = {
    getUrl: () => options.url || 'https://docs.google.com/spreadsheets/d/test-fixture/edit',
    getSheetByName(name) {
      events.push({ type: 'spreadsheet.getSheetByName', name });
      return sheets.get(name) || null;
    },
    insertSheet(name) {
      if (sheets.has(name)) throw new Error(`Sheet already exists: ${name}`);
      const sheet = createSheetFixture(name, []);
      sheets.set(name, sheet);
      events.push({ type: 'spreadsheet.insertSheet', name });
      return sheet;
    },
    getSheets: () => Array.from(sheets.values()),
    __getSheet: (name) => sheets.get(name) || null,
    __getEvents: () => events.slice()
  };

  return { spreadsheet, sheets, events };
}

function createAppsScriptRuntime(options = {}) {
  const events = [];
  const properties = new Map(Object.entries(options.properties || {}));
  const spreadsheetsById = new Map(Object.entries(options.spreadsheetsById || {}));
  const defaultSpreadsheet = options.spreadsheet || null;
  let lockHeld = false;
  let lockAttempts = 0;

  function resolveSpreadsheet(id) {
    if (id != null && spreadsheetsById.has(id)) return spreadsheetsById.get(id);
    if (defaultSpreadsheet) return defaultSpreadsheet;
    throw new Error(`No Spreadsheet fixture configured for ${id || 'active spreadsheet'}.`);
  }

  const scriptProperties = {
    getProperty(key) {
      events.push({ type: 'properties.get', key });
      return properties.has(key) ? properties.get(key) : null;
    },
    setProperty(key, value) {
      properties.set(key, String(value));
      events.push({ type: 'properties.set', key, value: String(value) });
      return scriptProperties;
    },
    deleteProperty(key) {
      properties.delete(key);
      events.push({ type: 'properties.delete', key });
      return scriptProperties;
    },
    getProperties: () => Object.fromEntries(properties.entries()),
    setProperties(values, deleteAllOthers = false) {
      if (deleteAllOthers) properties.clear();
      Object.entries(values || {}).forEach(([key, value]) => properties.set(key, String(value)));
      events.push({ type: 'properties.setMany', values: { ...(values || {}) }, deleteAllOthers });
      return scriptProperties;
    }
  };

  const scriptLock = {
    tryLock(timeoutMs) {
      lockAttempts += 1;
      events.push({ type: 'lock.try', timeoutMs });
      const available = typeof options.lockAvailable === 'function'
        ? options.lockAvailable(lockAttempts)
        : options.lockAvailable !== false;
      if (!available || lockHeld) return false;
      lockHeld = true;
      events.push({ type: 'lock.acquired' });
      return true;
    },
    waitLock(timeoutMs) {
      if (!scriptLock.tryLock(timeoutMs)) {
        throw new Error(`Script lock unavailable after ${timeoutMs}ms.`);
      }
    },
    hasLock: () => lockHeld,
    releaseLock() {
      events.push({ type: 'lock.release', heldBeforeRelease: lockHeld });
      lockHeld = false;
    }
  };

  const globals = {
    SpreadsheetApp: {
      openById(id) {
        events.push({ type: 'spreadsheet.openById', id });
        return resolveSpreadsheet(id);
      },
      getActiveSpreadsheet() {
        events.push({ type: 'spreadsheet.getActive' });
        return resolveSpreadsheet();
      },
      flush() {
        events.push({ type: 'spreadsheet.flush' });
      },
      getUi() {
        if (!options.ui) throw new Error('No UI fixture configured.');
        return options.ui;
      }
    },
    PropertiesService: {
      getScriptProperties() {
        events.push({ type: 'properties.getScriptProperties' });
        return scriptProperties;
      }
    },
    LockService: {
      getScriptLock() {
        events.push({ type: 'lock.getScriptLock' });
        return scriptLock;
      }
    },
    UrlFetchApp: {
      fetch(url, requestOptions) {
        events.push({ type: 'urlFetch.fetch', url: String(url), options: requestOptions || {} });
        if (typeof options.fetchImpl !== 'function') {
          throw new Error('Network access is disabled in the Apps Script test harness. Inject fetchImpl explicitly.');
        }
        return options.fetchImpl(url, requestOptions);
      }
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => options.activeUserEmail || '' }),
      getScriptTimeZone: () => options.timeZone || 'UTC'
    },
    Utilities: {
      sleep(milliseconds) {
        events.push({ type: 'utilities.sleep', milliseconds });
        if (typeof options.sleepImpl === 'function') options.sleepImpl(milliseconds);
      },
      getUuid() {
        const value = typeof options.uuidFactory === 'function'
          ? options.uuidFactory()
          : '00000000-0000-4000-8000-000000000000';
        events.push({ type: 'utilities.uuid', value });
        return value;
      },
      formatDate: (value) => toDisplayValue(value)
    },
    Logger: {
      log(...values) {
        events.push({ type: 'logger.log', values });
      }
    },
    HtmlService: options.HtmlService || {
      createTemplateFromFile() {
        throw new Error('No HtmlService template fixture configured.');
      },
      createHtmlOutputFromFile() {
        throw new Error('No HtmlService output fixture configured.');
      }
    }
  };

  return {
    globals,
    events,
    properties,
    scriptProperties,
    scriptLock,
    getEvents: (type) => type ? events.filter((event) => event.type === type) : events.slice(),
    resetEvents: () => events.splice(0, events.length)
  };
}

function extractHtmlScripts(source, filename) {
  const blocks = [];
  const pattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(source)) !== null) blocks.push(match[1]);
  if (!blocks.length) throw new Error(`No <script> block found in ${filename}.`);
  return blocks.join('\n');
}

function discoverFunctionDeclarations(source) {
  const names = [];
  const seen = new Set();
  const pattern = /^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      names.push(match[1]);
    }
  }
  return names;
}

function createAppsScriptHarness(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..', '..'));
  const runtime = options.runtime || createAppsScriptRuntime(options.runtimeOptions || {});
  const globals = {
    console,
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Map,
    Set,
    Promise,
    setTimeout,
    clearTimeout,
    ...runtime.globals,
    ...(options.globals || {})
  };
  globals.global = globals;
  globals.globalThis = globals;

  const context = vm.createContext(globals, {
    name: options.contextName || 'apps-script-test-harness',
    codeGeneration: { strings: true, wasm: false }
  });
  const loadedFiles = [];
  const functionNames = new Set();

  function loadSource(source, filename = 'inline.gs', loadOptions = {}) {
    let prepared = String(source);
    if (loadOptions.html || /\.html$/i.test(filename)) prepared = extractHtmlScripts(prepared, filename);
    if (typeof loadOptions.transform === 'function') prepared = loadOptions.transform(prepared, filename);
    const declarations = discoverFunctionDeclarations(prepared);
    new vm.Script(prepared, { filename, displayErrors: true })
      .runInContext(context, { timeout: loadOptions.timeoutMs || 1000 });
    declarations.forEach((name) => functionNames.add(name));
    loadedFiles.push({ path: filename, functions: declarations.slice() });
    return declarations;
  }

  function loadFiles(fileSpecs) {
    if (!Array.isArray(fileSpecs) || !fileSpecs.length) {
      throw new Error('loadFiles requires at least one source file.');
    }
    fileSpecs.forEach((spec) => {
      const normalized = typeof spec === 'string' ? { path: spec } : { ...spec };
      if (!normalized.path) throw new Error('Every source spec requires a path.');
      const absolutePath = path.resolve(repoRoot, normalized.path);
      const relativePath = path.relative(repoRoot, absolutePath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error(`Source path escapes repository root: ${normalized.path}`);
      }
      if (!fs.existsSync(absolutePath)) throw new Error(`Production source not found: ${relativePath}`);
      loadSource(fs.readFileSync(absolutePath, 'utf8'), relativePath.replace(/\\/g, '/'), normalized);
    });
    return api;
  }

  function getValue(name) {
    try {
      return vm.runInContext(String(name), context, { timeout: 1000 });
    } catch (error) {
      throw new Error(`Unable to resolve ${name} from loaded production source: ${error.message}`);
    }
  }

  function getFunction(name) {
    const value = getValue(name);
    if (typeof value !== 'function') throw new Error(`${name} is not a function in the loaded production source.`);
    return value;
  }

  const api = {
    context,
    runtime,
    loadSource,
    loadFiles,
    getValue,
    getFunction,
    listFunctions: () => Array.from(functionNames).sort(),
    getLoadedFiles: () => loadedFiles.map((entry) => ({ path: entry.path, functions: entry.functions.slice() }))
  };

  return api;
}

module.exports = {
  createAppsScriptHarness,
  createAppsScriptRuntime,
  createSheetFixture,
  createSpreadsheetFixture,
  discoverFunctionDeclarations,
  extractHtmlScripts
};

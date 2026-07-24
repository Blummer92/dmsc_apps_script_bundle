'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_EXCEPTION_FIELDS = [
  'symbolKey',
  'caller',
  'callerType',
  'owner',
  'reason',
  'replacement',
  'removalIssue'
];

function lineNumber(source, offset) {
  return String(source).slice(0, offset).split('\n').length;
}

function maskComments(source) {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, (match, prefix) => prefix + ' '.repeat(Math.max(0, match.length - prefix.length)));
}

function discoverMenuCallers(source, file, project) {
  const results = [];
  const pattern = /\.addItem\(\s*(['"])(?:\\.|(?!\1)[\s\S])*?\1\s*,\s*(['"])([A-Za-z_$][\w$]*)\2\s*\)/g;
  let match;
  while ((match = pattern.exec(source))) {
    results.push({
      project,
      symbol: match[3],
      callerType: 'menu',
      file,
      line: lineNumber(source, match.index),
      invocationStyle: 'string-handler',
      executable: true,
      dynamic: false
    });
  }
  return results;
}

function discoverGoogleScriptRunCallers(source, file, project) {
  const results = [];
  const masked = maskComments(source);
  const memberPattern = /google\.script\.run(?:(?:\s*\.\s*(?:withSuccessHandler|withFailureHandler|withUserObject)\s*\([^)]*\))*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = memberPattern.exec(masked))) {
    results.push({
      project,
      symbol: match[1],
      callerType: 'html',
      file,
      line: lineNumber(source, match.index),
      invocationStyle: 'member-call',
      executable: true,
      dynamic: false
    });
  }

  const literalBracketPattern = /google\.script\.run\s*\[\s*(['"])([A-Za-z_$][\w$]*)\1\s*\]\s*\(/g;
  while ((match = literalBracketPattern.exec(masked))) {
    results.push({
      project,
      symbol: match[2],
      callerType: 'html',
      file,
      line: lineNumber(source, match.index),
      invocationStyle: 'bracket-literal',
      executable: true,
      dynamic: false
    });
  }

  const dynamicBracketPattern = /google\.script\.run\s*\[\s*([^'"\]\s][^\]]*)\]\s*\(/g;
  while ((match = dynamicBracketPattern.exec(masked))) {
    results.push({
      project,
      symbol: '',
      callerType: 'dynamic-string',
      file,
      line: lineNumber(source, match.index),
      invocationStyle: 'bracket-dynamic',
      executable: true,
      dynamic: true,
      expression: match[1].trim()
    });
  }
  return results;
}

function discoverDirectCalls(source, file, project, knownSymbols) {
  const results = [];
  const masked = maskComments(source);
  const declarationOffsets = new Set();
  const declarationPattern = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let match;
  while ((match = declarationPattern.exec(masked))) declarationOffsets.add(match.index + match[0].lastIndexOf(match[1]));

  const callPattern = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  while ((match = callPattern.exec(masked))) {
    const symbol = match[1];
    if (!knownSymbols.has(symbol)) continue;
    if (declarationOffsets.has(match.index)) continue;
    const prefix = masked.slice(Math.max(0, match.index - 12), match.index);
    if (/function\s+$/.test(prefix)) continue;
    results.push({
      project,
      symbol,
      callerType: 'direct-source',
      file,
      line: lineNumber(source, match.index),
      invocationStyle: 'direct-call',
      executable: true,
      dynamic: false
    });
  }
  return results;
}

function discoverRegistryCallers(source, file, defaultProject) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return [];
  }
  const results = [];
  const suites = parsed && parsed.suites ? parsed.suites : {};
  Object.keys(suites).forEach((name) => {
    const suite = suites[name] || {};
    if (!suite.entryPoint) return;
    results.push({
      project: suite.target || defaultProject || 'unknown',
      symbol: String(suite.entryPoint),
      callerType: 'registry',
      file,
      line: 1,
      invocationStyle: 'json-entryPoint',
      executable: suite.classification !== 'blocked',
      dynamic: false,
      registryStatus: suite.classification || 'unknown',
      registryName: name
    });
  });
  return results;
}

function discoverDocumentationReferences(source, file, inventory) {
  const results = [];
  for (const item of inventory) {
    const pattern = new RegExp(`\\b${item.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    let match;
    while ((match = pattern.exec(source))) {
      const line = source.split('\n')[lineNumber(source, match.index) - 1] || '';
      const lower = line.toLowerCase();
      let documentKind = 'historical-mention';
      if (/blocked|retired|unsafe|do not|must not/.test(lower)) documentKind = 'safety-warning';
      else if (/run|execute|open the .* editor|operator/.test(lower)) documentKind = 'operator-instruction';
      else if (/replace|migrate|supersed/.test(lower)) documentKind = 'migration-note';
      results.push({
        project: item.project,
        symbol: item.symbol,
        callerType: 'documentation',
        file,
        line: lineNumber(source, match.index),
        invocationStyle: documentKind,
        executable: documentKind === 'operator-instruction',
        dynamic: false
      });
    }
  }
  return results;
}

function discoverTriggerReferences(source, file, project) {
  const patterns = [
    ['ScriptApp.newTrigger', /ScriptApp\.newTrigger\s*\(\s*(['"])([A-Za-z_$][\w$]*)\1\s*\)/g],
    ['onEdit', /\bfunction\s+(onEdit)\s*\(/g],
    ['onFormSubmit', /\bfunction\s+(onFormSubmit)\s*\(/g],
    ['doGet', /\bfunction\s+(doGet)\s*\(/g],
    ['doPost', /\bfunction\s+(doPost)\s*\(/g]
  ];
  const results = [];
  for (const [style, pattern] of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      results.push({
        project,
        symbol: match[2] || match[1],
        callerType: 'trigger',
        file,
        line: lineNumber(source, match.index),
        invocationStyle: style,
        executable: true,
        dynamic: false
      });
    }
  }
  return results;
}

function dedupeAndSort(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = [record.project, record.symbol, record.callerType, record.file, record.line, record.invocationStyle, record.expression || ''].join('|');
    if (!byKey.has(key)) byKey.set(key, record);
  }
  return [...byKey.values()].sort((a, b) => {
    const left = [a.project, a.symbol, a.callerType, a.file, a.line, a.invocationStyle].join(':');
    const right = [b.project, b.symbol, b.callerType, b.file, b.line, b.invocationStyle].join(':');
    return left.localeCompare(right);
  });
}

function validateCallerPolicy(policy) {
  const errors = [];
  const exceptions = policy.temporaryReferenceExceptions || [];
  exceptions.forEach((item, index) => {
    REQUIRED_EXCEPTION_FIELDS.forEach((field) => {
      if (item[field] === undefined || item[field] === null || String(item[field]).trim() === '') {
        errors.push(`temporaryReferenceExceptions[${index}] missing ${field}`);
      }
    });
  });
  return errors;
}

function findException(record, callerPolicy) {
  return (callerPolicy.temporaryReferenceExceptions || []).find((item) => (
    item.symbolKey === `${record.project}:${record.symbol}` &&
    item.callerType === record.callerType &&
    (item.caller === record.file || new RegExp(item.caller).test(record.file))
  ));
}

function evaluateCallers(records, inventory, callerPolicy) {
  const errors = validateCallerPolicy(callerPolicy);
  const inventoryByKey = new Map(inventory.map((item) => [`${item.project}:${item.symbol}`, item]));
  const symbolProjects = new Map();
  inventory.forEach((item) => {
    if (!symbolProjects.has(item.symbol)) symbolProjects.set(item.symbol, []);
    symbolProjects.get(item.symbol).push(item.project);
  });

  for (const record of records) {
    if (record.dynamic) {
      const reviewed = (callerPolicy.reviewedDynamicReferences || []).some((item) => item.file === record.file && item.line === record.line);
      if (!reviewed) errors.push(`${record.file}:${record.line}: unresolved dynamic Apps Script caller (${record.expression || record.invocationStyle})`);
      continue;
    }

    let key = `${record.project}:${record.symbol}`;
    let item = inventoryByKey.get(key);
    if (!item && symbolProjects.get(record.symbol) && symbolProjects.get(record.symbol).length === 1) {
      key = `${symbolProjects.get(record.symbol)[0]}:${record.symbol}`;
      item = inventoryByKey.get(key);
      record.project = item.project;
    }

    record.symbolKey = key;
    record.classification = item ? item.classification : 'unknown';
    record.temporaryException = findException(record, callerPolicy) || null;

    if (!item && record.executable) {
      errors.push(`${record.file}:${record.line}: executable caller references unknown symbol ${record.symbol}`);
      continue;
    }

    if (item && item.classification === 'retired' && record.executable && !record.temporaryException) {
      errors.push(`${record.file}:${record.line}: retired symbol ${key} has unapproved executable caller (${record.callerType})`);
    }
  }
  return errors;
}

function projectForFile(file, entryPolicy) {
  const normalized = file.split(path.sep).join('/');
  const candidates = (entryPolicy.projects || []).filter((project) => {
    const root = String(project.root || '.').replace(/^\.\/?/, '').replace(/\/$/, '');
    return root === '' || normalized === root || normalized.startsWith(root + '/');
  }).sort((a, b) => String(b.root).length - String(a.root).length);
  return candidates.length ? candidates[0].name : 'unknown';
}

function walk(directory, ignored) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(full, ignored));
    else output.push(full);
  }
  return output;
}

function buildCallerReport(repositoryRoot, entryPolicy, callerPolicy, inventory) {
  const knownSymbols = new Set(inventory.map((item) => item.symbol));
  const ignored = new Set(['.git', 'node_modules']);
  const files = walk(repositoryRoot, ignored);
  const records = [];

  for (const full of files) {
    const relative = path.relative(repositoryRoot, full).split(path.sep).join('/');
    const extension = path.extname(relative).toLowerCase();
    const source = fs.readFileSync(full, 'utf8');
    const project = projectForFile(relative, entryPolicy);

    if (extension === '.gs' || extension === '.js' || extension === '.html') {
      records.push(...discoverMenuCallers(source, relative, project));
      records.push(...discoverGoogleScriptRunCallers(source, relative, project));
      records.push(...discoverDirectCalls(source, relative, project, knownSymbols));
      records.push(...discoverTriggerReferences(source, relative, project));
    }
    if (relative === 'config/live-smoke-suites.json') records.push(...discoverRegistryCallers(source, relative, 'root-dashboard'));
    if (extension === '.md') records.push(...discoverDocumentationReferences(source, relative, inventory));
  }

  const callers = dedupeAndSort(records);
  const errors = evaluateCallers(callers, inventory, callerPolicy);
  return { callers, errors };
}

module.exports = {
  discoverMenuCallers,
  discoverGoogleScriptRunCallers,
  discoverDirectCalls,
  discoverRegistryCallers,
  discoverDocumentationReferences,
  discoverTriggerReferences,
  validateCallerPolicy,
  evaluateCallers,
  dedupeAndSort,
  buildCallerReport
};

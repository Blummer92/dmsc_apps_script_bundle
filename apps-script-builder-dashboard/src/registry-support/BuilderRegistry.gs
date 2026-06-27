/**
 * Read-only accessors for the Apps Script Project Registry sheet.
 */
function readBuilderRegistryRows() {
  const sheet = getBuilderRegistrySheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      headers: values[0] || [],
      rows: [],
    };
  }

  const headers = values[0].map((value) => String(value).trim());
  const missingHeaders = getMissingBuilderRegistryHeaders_(headers);

  if (missingHeaders.length) {
    throw new Error(`Missing registry headers: ${missingHeaders.join(', ')}`);
  }

  const rows = values.slice(1)
    .map((row, index) => rowToBuilderRegistryObject_(headers, row, index + 2))
    .filter((project) => hasAnyBuilderRegistryValue_(project));

  return { headers, rows };
}

function getMissingBuilderRegistryHeaders_(headers) {
  return BUILDER_REGISTRY_REQUIRED_HEADERS.filter((field) => headers.indexOf(field) === -1);
}

function rowToBuilderRegistryObject_(headers, row, rowNumber) {
  const project = {
    rowNumber,
    raw: {},
  };

  headers.forEach((header, index) => {
    if (!header) {
      return;
    }

    project.raw[header] = normalizeBuilderRegistryCell_(row[index]);
  });

  return project;
}

function hasAnyBuilderRegistryValue_(project) {
  return Object.keys(project.raw).some((header) => project.raw[header] !== '');
}

function normalizeBuilderRegistryCell_(value) {
  if (value === null || typeof value === 'undefined') {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

/**
 * Read-only accessors for the Apps Script Project Registry sheet.
 */
function readBuilderRegistryRows() {
  const sheet = getRegistrySheet_();
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return {
      headers: values[0] || [],
      rows: [],
    };
  }

  const headers = values[0].map((value) => String(value).trim());
  const rows = values.slice(1)
    .map((row, index) => rowToBuilderRegistryObject_(headers, row, index + 2))
    .filter((project) => hasAnyBuilderRegistryValue_(project));

  return { headers, rows };
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

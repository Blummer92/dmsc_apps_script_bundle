/**
 * Temporary read-only smoke test for the DMSC dashboard backend.
 *
 * This function does not write to Sheets, Drive, Apps Script properties, or
 * production data. It logs bootstrap status, summary, row count, and the first
 * returned record so the dashboard data mapping can be verified.
 */
function testDmscDashboardBackend() {
  const bootstrap = getDmscDashboardBootstrap();
  const rows = getDmscDashboardRows({ page: 1, pageSize: 5 });

  Logger.log(JSON.stringify({
    bootstrapOk: bootstrap.ok,
    config: bootstrap.config,
    queueCount: bootstrap.queues ? bootstrap.queues.length : 0,
    summary: rows.summary,
    totalMatchingRecords: rows.total,
    returnedRecordCount: rows.records ? rows.records.length : 0,
    firstRecord: rows.records && rows.records.length ? rows.records[0] : null
  }, null, 2));
}

/**
 * Temporary read-only smoke test for the DMSC dashboard backend.
 *
 * This function does not write to Sheets, Drive, Apps Script properties, or
 * production data. It logs the current dashboard summary, record count, and
 * first returned record so the dashboard data mapping can be verified.
 */
function testDmscDashboardBackend() {
  const data = getDmscDashboardData();
  Logger.log(JSON.stringify({
    summary: data.summary,
    recordCount: data.records ? data.records.length : 0,
    firstRecord: data.records && data.records.length ? data.records[0] : null
  }, null, 2));
}

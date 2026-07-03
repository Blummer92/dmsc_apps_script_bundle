/**
 * Optional Drive CSV export for the source-approved asset audit.
 *
 * This creates new CSV files for testing and handoff. It does not update
 * Notion and does not modify the source Google Sheet.
 */

const VAM_SOURCE_AUDIT_EXPORT_CONFIG = {
  EXPORT_FOLDER_ID: '1PFkpcd3yiFVzildmQNSAij4HiJQew_3W',
  SYNC_READY_PREFIX: 'source-approved-assets-sync-ready',
  REPORT_PREFIX: 'source-approved-assets-verification-report'
};

function exportSourceApprovedAuditCsvToDrive() {
  const audit = runSourceApprovedVisualAssetAudit();
  const folder = getSourceAuditExportFolder_();
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMdd-HHmmss'
  );

  const syncReadyFile = folder.createFile(
    VAM_SOURCE_AUDIT_EXPORT_CONFIG.SYNC_READY_PREFIX + '-' + timestamp + '.csv',
    audit.csv,
    MimeType.CSV
  );
  const reportFile = folder.createFile(
    VAM_SOURCE_AUDIT_EXPORT_CONFIG.REPORT_PREFIX + '-' + timestamp + '.csv',
    audit.reportCsv,
    MimeType.CSV
  );

  const result = {
    syncReadyCsvName: syncReadyFile.getName(),
    syncReadyCsvUrl: syncReadyFile.getUrl(),
    reportCsvName: reportFile.getName(),
    reportCsvUrl: reportFile.getUrl(),
    totalApprovedRowsFound: audit.report.totalApprovedRowsFound,
    totalApprovedRowsMissingDriveFileId: audit.report.totalApprovedRowsMissingDriveFileId,
    totalApprovedRowsMissingSourceFileLink: audit.report.totalApprovedRowsMissingSourceFileLink,
    sourceGoogleSheetUpdated: 'No',
    notionUpdated: 'No'
  };

  Logger.log('Source-approved audit CSV export complete:\n%s', JSON.stringify(result, null, 2));
  return result;
}

function getSourceAuditExportFolder_() {
  const folderId = String(VAM_SOURCE_AUDIT_EXPORT_CONFIG.EXPORT_FOLDER_ID || '').trim();
  if (!folderId) {
    throw new Error('Configure VAM_SOURCE_AUDIT_EXPORT_CONFIG.EXPORT_FOLDER_ID before exporting.');
  }
  return DriveApp.getFolderById(folderId);
}

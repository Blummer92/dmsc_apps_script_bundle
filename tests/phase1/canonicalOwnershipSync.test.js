const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');
}

describe('canonical ownership sync boundary', () => {
  const service = read('drive-metadata-dashboard/src/CanonicalOwnershipNotionSyncService.gs');
  const wrappers = read('drive-metadata-dashboard/src/NotionDryRun.gs');
  const sourceControl = read('DMSC_SourceControlDecision.gs');
  const dashboard = read('Dashboard.html');

  test('public Drive Metadata staging entry points use the canonical ownership service', () => {
    expect(wrappers).toContain('CanonicalOwnershipNotionSyncService.dryRunRows2To11()');
    expect(wrappers).toContain('CanonicalOwnershipNotionSyncService.syncRows2To11ToStaging()');
    expect(wrappers).toContain('CanonicalOwnershipNotionSyncService.dryRunEligibleStagingBatch()');
    expect(wrappers).toContain('CanonicalOwnershipNotionSyncService.syncEligibleStagingBatchToStaging()');
  });

  test('legacy production-like fields are denylisted rather than written', () => {
    expect(service).toContain("'production_source_approval_status'");
    expect(service).toContain("'generation_clearance'");
    expect(service).toContain("'production_authorized'");
    expect(service).toContain('Blocked authority-bearing field in Drive Metadata sync payload');
    expect(service).not.toMatch(/production_source_approval_status\s*:\s*['\"]Not approved/);
    expect(service).not.toMatch(/generation_clearance\s*:\s*['\"]Not approved/);
  });

  test('technical sync status replaces production-like clearance fields', () => {
    expect(service).toContain('sync_eligibility: eligibility.syncStatus');
    expect(service).toContain("syncStatus: 'Eligible for sync'");
    expect(service).toContain("syncStatus: 'Needs review'");
    expect(service).toContain("syncStatus: 'Blocked'");
  });

  test('canonical source and unit identifiers are read with legacy unit fallback', () => {
    expect(service).toContain('canonical_source_id');
    expect(service).toContain('canonical_source_url');
    expect(service).toContain('canonical_unit_id');
    expect(service).toContain('canonical_unit_url');
    expect(service).toContain('legacy_unit_name');
    expect(service).toContain('record.unit_name, record.unit, record.unit_visual_system');
  });

  test('source-control approval wording cannot be confused with Production Authorized', () => {
    expect(sourceControl).toContain("pilot_review_status: 'Source Control Approved'");
    expect(sourceControl).toContain("decision_scope: 'source_control_only'");
    expect(sourceControl).toContain('production_authorized: false');
    expect(sourceControl).not.toContain("pilot_review_status: 'Production Approved'");
    expect(dashboard).toContain('.approveDmscSourceControlDecision({');
    expect(dashboard).toContain('Production authorization remains unchanged.');
  });
});
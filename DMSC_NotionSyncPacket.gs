/**
 * Builds a read-only Notion sync packet for DMSC library routing.
 *
 * This does not write to Notion.
 * This does not approve assets.
 * This does not mutate Sheets or Drive.
 */
function buildDmscNotionLibrarySyncPacket(payload) {
  payload = payload || {};

  const staged = stageDmscSourceApprovalBatch({
    fileIds: payload.fileIds || null,
    queueId: payload.queueId || 'sourceClearanceNeeded',
    limit: payload.limit || 5
  });

  const visualAssetLibrary = [];
  const iconSystem = [];
  const promptLibrary = [];
  const skipped = [];

  staged.items.forEach(function(item) {
    if (!item || item.ok !== true) {
      skipped.push({
        fileId: item && item.fileId ? item.fileId : '',
        reason: item && item.error ? item.error : 'Staged item was not valid.'
      });
      return;
    }

    const detail = getDmscDashboardRecord(item.fileId).record;
    const promptText = getDmscNotionPromptText_(detail);
    const isIcon = isDmscNotionIconAsset_(detail, item);
    const assetTitle = detail.fileName || item.fileName || item.fileId;

    visualAssetLibrary.push({
      target: 'Visual Asset Library',
      dataSourceUrl: 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd',
      key: item.fileId,
      properties: {
        'Asset title': assetTitle,
        'Asset type': isIcon ? 'icon' : 'worksheet image',
        'AI Prompt': promptText,
        'Editable source link': detail.driveUrl || '',
        'Human Review Status': item.approvalReady ? 'In progress' : 'Not started',
        'AI Metadata Status': promptText ? 'Done' : 'Not started'
      },
      content: buildDmscNotionAssetContent_(detail, item)
    });

    if (isIcon) {
      iconSystem.push({
        target: 'Icon System',
        dataSourceUrl: 'collection://2a1a281c-0ecb-4a1b-9710-acd85bc81872',
        key: item.fileId,
        properties: {
          'Icon Name': assetTitle,
          'Icon Category': inferDmscIconCategory_(assetTitle),
          'Meaning': detail.sourceSummary || detail.reviewReason || '',
          'Source / Asset Link': detail.driveUrl || '',
          'Source Approved?': item.currentState.sourceControlClearanceNeeded === 'No' ? '__YES__' : '__NO__',
          'Production Route': item.approvalReady ? 'Source Approval' : 'Production Pause',
          'Current Review Owner': 'Digital Media Source Reviewer'
        },
        content: buildDmscNotionIconContent_(detail, item)
      });
    }

    if (promptText) {
      promptLibrary.push({
        target: 'Prompt Library',
        dataSourceUrl: 'collection://350aff48-97ee-4022-8546-01ea8fc1497a',
        key: item.fileId + ':prompt',
        properties: {
          'Prompt Name': assetTitle + ' Prompt',
          'Prompt Text': promptText,
          'Asset Type': isIcon ? 'Worksheet icon' : 'Instructional visual',
          'Reuse Status': 'Human review',
          'Result Quality': 'Not reviewed',
          'Safe For Future Use': '__NO__',
          'Source Authority': 'Draft / partial'
        },
        content: buildDmscNotionPromptContent_(detail, item, promptText)
      });
    }
  });

  return {
    ok: true,
    source: 'DMSC Dashboard Backend',
    mode: 'read_only_packet',
    notionTargets: {
      visualAssetLibrary: 'collection://da5cba48-50fd-4377-9790-8df8f6f2c7dd',
      iconSystem: 'collection://2a1a281c-0ecb-4a1b-9710-acd85bc81872',
      promptLibrary: 'collection://350aff48-97ee-4022-8546-01ea8fc1497a'
    },
    summary: {
      staged: staged.total,
      visualAssets: visualAssetLibrary.length,
      icons: iconSystem.length,
      prompts: promptLibrary.length,
      skipped: skipped.length
    },
    visualAssetLibrary: visualAssetLibrary,
    iconSystem: iconSystem,
    promptLibrary: promptLibrary,
    skipped: skipped
  };
}

function testBuildDmscNotionLibrarySyncPacket() {
  const ss = getDashboardSpreadsheet_();
  const auditSheet = ss.getSheetByName(DMSC_APP_CONFIG.auditSheetName);
  const auditRowsBefore = auditSheet ? auditSheet.getLastRow() : 0;

  const result = buildDmscNotionLibrarySyncPacket({
    queueId: 'sourceClearanceNeeded',
    limit: 5
  });

  const auditRowsAfter = auditSheet ? auditSheet.getLastRow() : 0;

  if (result.ok !== true) {
    throw new Error('Notion sync packet did not return ok=true.');
  }

  if (result.summary.visualAssets <= 0) {
    throw new Error('Notion sync packet produced no visual asset rows.');
  }

  if (result.summary.prompts <= 0) {
    throw new Error('Notion sync packet produced no prompt rows.');
  }

  if (auditRowsBefore !== auditRowsAfter) {
    throw new Error('Notion sync packet wrote to audit log; expected read-only behavior.');
  }

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function getDmscNotionPromptText_(record) {
  return String(
    record.approvedPrompt ||
    record.projectedImagePrompt ||
    record.promptEvidenceExcerpt ||
    record.proposedPrompt ||
    ''
  ).trim();
}

function isDmscNotionIconAsset_(record, item) {
  const text = [
    record.fileName,
    record.fullPath,
    record.assetCategory,
    record.sourceType,
    item.fileName
  ].join(' ').toLowerCase();

  return text.indexOf('icon') !== -1 || text.indexOf('cb-icon') !== -1 || text.indexOf('-icon-') !== -1;
}

function inferDmscIconCategory_(title) {
  const text = String(title || '').toLowerCase();

  if (text.indexOf('color') !== -1) return 'Color';
  if (text.indexOf('font') !== -1 || text.indexOf('text') !== -1) return 'Font';
  if (text.indexOf('fix') !== -1 || text.indexOf('revision') !== -1) return 'Fix';
  if (text.indexOf('partner') !== -1 || text.indexOf('check') !== -1) return 'Check';
  if (text.indexOf('build') !== -1 || text.indexOf('canvas') !== -1) return 'Build';
  if (text.indexOf('plan') !== -1) return 'Plan';

  return 'Check';
}

function buildDmscNotionAssetContent_(record, item) {
  return [
    '## DMSC Visual Asset Sync Packet',
    '',
    '- File ID: ' + item.fileId,
    '- File name: ' + (record.fileName || item.fileName || ''),
    '- Drive URL: ' + (record.driveUrl || ''),
    '- Source verification: ' + (item.currentState.sourceVerificationStatus || ''),
    '- Source clearance needed: ' + (item.currentState.sourceControlClearanceNeeded || ''),
    '',
    '### Approval readiness',
    '',
    '- Approval ready: ' + (item.approvalReady ? 'Yes' : 'No'),
    '- Evidence required: ' + (item.evidenceRequired ? 'Yes' : 'No'),
    '- Blockers: ' + ((item.blockers || []).join('; ') || 'None'),
    '- Warnings: ' + ((item.warnings || []).join('; ') || 'None')
  ].join('\n');
}

function buildDmscNotionIconContent_(record, item) {
  return [
    '## DMSC Icon System Sync Packet',
    '',
    '- File ID: ' + item.fileId,
    '- Icon file: ' + (record.fileName || item.fileName || ''),
    '- Source link: ' + (record.driveUrl || ''),
    '- Production route: ' + (item.approvalReady ? 'Source Approval' : 'Production Pause')
  ].join('\n');
}

function buildDmscNotionPromptContent_(record, item, promptText) {
  return [
    '## DMSC Prompt Library Sync Packet',
    '',
    '- File ID: ' + item.fileId,
    '- Source asset: ' + (record.fileName || item.fileName || ''),
    '- Source link: ' + (record.driveUrl || ''),
    '',
    '### Prompt',
    '',
    promptText
  ].join('\n');
}

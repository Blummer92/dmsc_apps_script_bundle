/**
 * Visual Asset Metadata Governance Validator
 *
 * Warning-only validator for the Visual Asset Metadata workbook.
 * This module is designed to live beside the existing DMSC Dashboard code.
 *
 * Safety boundary:
 * - Does not overwrite asset rows.
 * - Does not approve assets.
 * - Does not migrate historical data.
 * - Writes only to the generated "Validation Dashboard" tab.
 */

const VAM_GOV_CONFIG = Object.freeze({
  spreadsheetId: '19rnFcTTs2zdaOs3wyZ_0NebjzczTPY9EqaLsybEU6bw',
  assetSheetName: 'Visual Asset Metadata',
  dashboardSheetName: 'Validation Dashboard',
  headerRow: 1,
  firstDataRow: 2,
  timezone: 'America/Detroit',
  warningOnly: true,
  executionLog: Object.freeze({
    enabled: true,
    includeEngineerPrompt: true,
    engineerPrompt: [
      'Google Workspace Automation Engineer fix prompt:',
      'Review the Visual Asset Metadata Governance Apps Script and make the safety fixes requested by the Apps Script Sync Test Agent.',
      'Keep the workflow warning-only unless governance owner approval explicitly authorizes writes.',
      'Add a dashboard target guard so Validation Dashboard can never resolve to the Visual Asset Metadata asset sheet.',
      'Reject duplicate headers before validation so schema collisions cannot silently read the wrong column.',
      'Clarify workflow stage matching for overlapping Next Workflow Step values.',
      'Define whether controlled-value fields are single-select or semicolon-separated multi-select, then test that behavior.',
      'Before any future asset-row, Notion, production, or Visual Asset Library write, require dry-run success, explicit approval, and synced_count === verified_count.',
      'Log each runtime write phase to the Apps Script execution log, including target sheet, range, row count, and confirmation that no asset rows were changed.'
    ].join('\n')
  }),
  multiSelectControlledFields: Object.freeze([
    'Suggested Reuse'
  ]),
  fields: Object.freeze({
    assetId: 'Asset ID',
    assetName: 'Asset Name',
    driveLink: 'Drive Link',
    driveFileId: 'Drive File ID',
    originalFilename: 'Original Filename',
    canonicalFilename: 'Canonical Filename',
    metadataStatus: 'Metadata Status',
    nextWorkflowStep: 'Next Workflow Step'
  }),
  requiredFields: Object.freeze([
    'Asset ID',
    'Asset Name',
    'Asset Type',
    'Course',
    'Intended Instructional Use',
    'Description',
    'Metadata Status',
    'Next Workflow Step',
    'Human Review Required'
  ]),
  controlledValues: Object.freeze({
    'Asset Type': ['Icon', 'Icon Set', 'Image', 'Worksheet Visual', 'Branding Sample', 'Screenshot', 'PDF Extract', 'Reference', 'AI-Generated Visual', 'Other'],
    'Best-Fit Unit': ['Candy Branding Design', 'Adobe Express Foundations', 'Typography Foundations', 'Expressive Typography Poster', 'Video Foundations', 'Portfolio / Showcase', 'Other / Unclear'],
    'Student-Facing?': ['Yes', 'No', 'Unclear'],
    'Teacher-Facing?': ['Yes', 'No', 'Unclear'],
    'Quality / Readiness': ['Clear', 'Needs Cleanup', 'Blurry', 'Cropped', 'Low Resolution', 'Needs Source Verification', 'Not Classroom Ready'],
    'Source / Permission Status': ['Known', 'Unclear', 'Missing', 'Needs Verification'],
    'Duplicate Status': ['Primary', 'Duplicate', 'Near Duplicate', 'Possible Duplicate', 'Unique', 'Unclear'],
    'Keep Decision': ['Keep', 'Keep as Reference', 'Duplicate', 'Low Confidence', 'Do Not Use Yet'],
    'Suggested Reuse': ['Worksheet', 'Slide', 'Prompt', 'Critique Activity', 'Template', 'Reference Library', 'Teacher Background'],
    'Agent Decision': ['approved_internal_classroom', 'needs_review', 'blocked', 'reference_only', 'candidate_pending_qa', 'missing_file'],
    'Approval Gate Complete?': ['Yes', 'No'],
    'Exact File ID Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Approved Folder Placement Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Source / Safe-Use Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Visual QA / Readability Verified?': ['Verified', 'Unverified', 'Blocked', 'Not Applicable'],
    'Internal Classroom Use Boundary': ['Pending', 'Internal classroom only', 'Teacher/reference only', 'Not student-facing', 'Unknown', 'Do not use'],
    'Course': ['Digital Media', 'Other / Unclear'],
    'Prompt Version': ['v1', 'v2', 'v3', 'Current', 'Archived'],
    'Style Category': ['Icon', 'Flat illustration', 'Classroom visual', 'Diagram', 'Photo-realistic', 'Reference', 'Other'],
    'AI Generation Tool': ['Pending', 'ChatGPT image generation', 'DALL-E', 'Midjourney', 'Adobe Firefly', 'Other', 'Not Applicable'],
    'Prompt Source': ['Pending', 'Visual Asset Director', 'Human-authored', 'Revised from existing prompt', 'Imported package', 'Other'],
    'Reference Image Used': ['Pending', 'Yes', 'No', 'Not Applicable'],
    'External Source Used': ['Pending', 'Yes', 'No', 'Not Applicable'],
    'Copyright or Trademark Risk Assessment': ['Pending', 'Low', 'Medium', 'High', 'Blocked', 'Not Applicable'],
    'Human Review Required': ['Pending', 'Yes', 'No', 'Not Applicable'],
    'Source Approval Status': ['Pending', 'Not Started', 'Needs Review', 'Approved', 'Blocked', 'Not Applicable'],
    'Approved Use': ['Pending', 'Internal classroom only', 'Teacher/reference only', 'Not student-facing', 'Approved student-facing', 'Do not use', 'Not Applicable'],
    'Reuse Status': ['Pending', 'New prompt package', 'Candidate', 'Approved for reuse', 'Reference only', 'Do not reuse', 'Superseded', 'Duplicate'],
    'Drive Upload Status': ['Pending', 'Not generated', 'Not uploaded', 'Uploaded', 'Linked', 'Missing file', 'Not Applicable'],
    'Source Authority Review': ['Pending', 'Not started', 'Needs review', 'Reviewed', 'Approved', 'Blocked', 'Not Applicable'],
    'Metadata Status': ['Draft', 'Metadata Ready', 'Needs Metadata', 'Needs Human Review', 'Complete', 'Blocked', 'Superseded'],
    'Next Workflow Step': ['Pending', 'Generate image', 'Upload to Drive', 'Source review', 'Human review', 'Visual QA', 'Approve use', 'Archive', 'Blocked', 'Complete']
  }),
  workflowStages: Object.freeze([
    Object.freeze({
      name: 'Metadata',
      nextSteps: ['Pending', 'Generate image'],
      requiredFields: ['Asset ID', 'Asset Name', 'Asset Type', 'Course', 'Unit', 'Lesson', 'Intended Instructional Use', 'Description', 'Metadata Status'],
      blocker: 'Asset identity is missing, duplicated, or mixed with unrelated assets.'
    }),
    Object.freeze({
      name: 'Prompt Package',
      nextSteps: ['Upload to Drive'],
      requiredFields: ['Prompt Version', 'Full Production Prompt', 'Style Category', 'Prompt Source', 'Reference Image Used', 'External Source Used', 'Created By', 'Date Created'],
      blocker: 'Prompt text, intended use, tool, source, or reference status is unknown.'
    }),
    Object.freeze({
      name: 'Generation',
      nextSteps: ['Upload to Drive'],
      requiredFields: ['AI Generation Tool', 'Date Created', 'Human Review Required'],
      blocker: 'Tool/source/reference information is missing or policy review is required first.'
    }),
    Object.freeze({
      name: 'Drive Upload',
      nextSteps: ['Visual QA', 'Source review'],
      requiredFields: ['Drive Link', 'Drive File ID', 'Drive Upload Status', 'Folder', 'Folder ID', 'Exact File ID Verified?', 'Last Verified Date'],
      blocker: 'File ID, link, folder, or mapping is ambiguous or missing.'
    }),
    Object.freeze({
      name: 'QA',
      nextSteps: ['Approve use', 'Human review'],
      requiredFields: ['Visual QA Status', 'Visual QA / Readability Verified?', 'Alt Text', 'Review Owner', 'Review Date'],
      blocker: 'Image is unreadable, cropped, unclear, or missing accessibility review.'
    }),
    Object.freeze({
      name: 'Governance',
      nextSteps: ['Approve use', 'Human review'],
      requiredFields: ['Source Authority Review', 'Source Approval Status', 'Safe Use Status', 'Source Visibility', 'Citation Evidence', 'Provenance Status', 'External Source Used', 'Copyright or Trademark Risk Assessment', 'Internal Classroom Use Boundary', 'Human Review Required'],
      blocker: 'Evidence is missing, source is unclear, or risk is unresolved.'
    }),
    Object.freeze({
      name: 'Approval',
      nextSteps: ['Archive', 'Complete'],
      requiredFields: ['Approved Use', 'Approved Folder Placement Verified?', 'Approval Evidence Link', 'Last Verified Date'],
      blocker: 'Approval evidence, safe-use clearance, QA, or placement evidence is incomplete.'
    })
  ])
});

var VAM_GOV_ACTIVE_RUN_ID = '';

const FIELD_CONTRACT = Object.freeze([
  {
    field_name: 'alpha',
    classification: 'canonical_metadata',
    owner_database: 'Owner A',
    consuming_database: 'Consumer A',
    safe_sync_rule: 'May write alpha.',
    blocked_until_owner_review: false
  },
  {
    field_name: 'beta',
    classification: 'lookup_only',
    owner_database: 'Owner B',
    consuming_database: 'Consumer B',
    safe_sync_rule: 'Display only.',
    blocked_until_owner_review: true
  },
  {
    field_name: 'gamma_only_in_gs',
    classification: 'canonical_metadata',
    owner_database: 'Owner C',
    consuming_database: 'Consumer C',
    safe_sync_rule: 'May write gamma.',
    blocked_until_owner_review: false
  }
]);

const WRITABLE_OPERATIONAL_FIELDS = Object.freeze(['alpha']);
const DENIED_SYNC_FIELDS = Object.freeze(['beta']);

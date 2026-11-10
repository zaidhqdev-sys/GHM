import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261110120000_create_business_relationship_outcome_read_models.sql', 'utf8');

test('relationship and outcome models preserve provenance, lifecycle and temporal constraints', () => {
  assert.match(migration, /business_relationship_distinct_businesses/);
  assert.match(migration, /participant_assertion/);
  assert.match(migration, /authority_type/);
  assert.match(migration, /verification_status/);
  assert.match(migration, /valid_until IS NULL OR valid_until > valid_from/);
  assert.match(migration, /outcome_has_subject_context/);
  assert.match(migration, /outcome_assertion_source_check/);
  assert.match(migration, /outcome_lifecycle_status_check/);
});

test('runtime receives read-only access to relationship and outcome projections', () => {
  assert.match(migration, /GRANT SELECT ON ghm\.relationship_type, ghm\.business_relationship, ghm\.outcome_type, ghm\.outcome TO ghm_runtime/);
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ghm\.relationship_type, ghm\.business_relationship, ghm\.outcome_type, ghm\.outcome FROM ghm_runtime/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const initial = readFileSync(join(process.cwd(), 'database/migrations/20261020130000_create_quoteflow_migration_business_provisioning.sql'), 'utf8');
const reconciled = readFileSync(join(process.cwd(), 'database/migrations/20261020140000_reconcile_quoteflow_provisioning_verification_status.sql'), 'utf8');

test('QuoteFlow business provisioning is migration-only and records exact provenance', () => {
  assert.match(initial, /CREATE TABLE ghm\.quoteflow_migration_business_provisioning_audit/i);
  assert.match(initial, /UNIQUE \(provider, external_business_id\)/i);
  assert.match(initial, /REFERENCES ghm\.account_identity\(id\)/i);
  assert.match(initial, /REFERENCES ghm\.business\(id\)/i);
  assert.match(initial, /pg_advisory_xact_lock/i);
  assert.match(initial, /INSERT INTO ghm\.business_membership/i);
  assert.match(initial, /INSERT INTO ghm\.business_external_mapping/i);
  assert.match(initial, /INSERT INTO ghm\.quoteflow_migration_business_provisioning_audit/i);
  assert.match(initial, /REVOKE ALL ON FUNCTION ghm\.auth_provision_quoteflow_migration_business[\s\S]*FROM ghm_runtime/i);
  assert.doesNotMatch(initial, /GRANT EXECUTE ON FUNCTION ghm\.auth_provision_quoteflow_migration_business[\s\S]*TO ghm_runtime/i);
});

test('QuoteFlow provisioning starts unverified and inactive after status reconciliation', () => {
  assert.match(reconciled, /VALUES \(btrim\(p_business_name\), btrim\(p_business_slug\), 'unverified', false\)/i);
  assert.match(reconciled, /REVOKE ALL ON FUNCTION ghm\.auth_provision_quoteflow_migration_business[\s\S]*FROM ghm_runtime/i);
  assert.match(reconciled, /GRANT EXECUTE ON FUNCTION ghm\.auth_provision_quoteflow_migration_business[\s\S]*TO ghm_schema_owner/i);
  assert.doesNotMatch(reconciled, /GRANT EXECUTE ON FUNCTION ghm\.auth_provision_quoteflow_migration_business[\s\S]*TO ghm_runtime/i);
});

test('provisioning has no public HTTP or credential/session side effects', () => {
  assert.doesNotMatch(initial + reconciled, /CREATE (?:OR REPLACE )?FUNCTION ghm\.(?:auth_register|auth_create_session)/i);
  assert.doesNotMatch(initial + reconciled, /CREATE ROUTE|CREATE PUBLICATION/i);
});

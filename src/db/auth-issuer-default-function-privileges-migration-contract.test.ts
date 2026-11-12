import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/migrations/20261112050000_revoke_public_default_function_execution.sql',
), 'utf8');
const issuerCutover = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql',
), 'utf8');

test('future GHM functions created by the schema owner do not inherit PUBLIC EXECUTE', () => {
  assert.ok(migration.includes('ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner'));
  assert.ok(migration.includes('REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC'));
  assert.doesNotMatch(migration, /IN SCHEMA ghm/);
});

test('issuer allow-list is applied after clearing current function grants', () => {
  assert.ok(issuerCutover.includes('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ghm FROM ghm_auth_issuer'));
  assert.ok(issuerCutover.includes('GRANT EXECUTE ON FUNCTION ghm.auth_create_account'));
});


const businessMappingLinkMigration = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/migrations/20261112060000_revoke_runtime_business_external_mapping_link.sql',
), 'utf8');

test('business external mapping creation remains an operator/migration capability', () => {
  assert.match(businessMappingLinkMigration, /REVOKE ALL ON FUNCTION ghm\.auth_link_business_external_mapping\(text, text, bigint\)/);
  assert.match(businessMappingLinkMigration, /FROM PUBLIC, ghm_runtime/);
});

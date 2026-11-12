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


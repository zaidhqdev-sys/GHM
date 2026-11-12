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
  assert.match(migration, /ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner IN SCHEMA ghm[\\s\\S]*?REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/i);
});

test('issuer allow-list is applied after clearing current function grants', () => {
  assert.match(issuerCutover, /REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ghm FROM ghm_auth_issuer/i);
  assert.match(issuerCutover, /GRANT EXECUTE ON FUNCTION ghm\\.auth_create_account/i);
});

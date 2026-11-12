import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/migrations/20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration.sql',
), 'utf8');
const issuerCutover = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql',
), 'utf8');
const issuerQualification = fs.readFileSync(path.resolve(
  process.cwd(),
  'scripts/qualify-auth-issuer-cutover.mjs',
), 'utf8');

test('QuoteFlow reset enrollment registration is migration-only, not a runtime or issuer operation', () => {
  const signature = 'ghm\\.auth_register_quoteflow_migration_reset_enrollment\\(\\s*bigint,\\s*text,\\s*text,\\s*text,\\s*text,\\s*text\\s*\\)';
  assert.match(migration, new RegExp('REVOKE ALL ON FUNCTION ' + signature + '[\\s\\S]*?FROM PUBLIC, ghm_runtime', 'i'));
  assert.match(issuerCutover, new RegExp('REVOKE ALL ON FUNCTION ' + signature + '[\\s\\S]*?FROM PUBLIC, ghm_runtime, ghm_auth_issuer', 'i'));
  assert.match(issuerQualification, /auth_register_quoteflow_migration_reset_enrollment/);
  assert.match(issuerQualification, /expected ghm_runtime to be denied/);
  assert.match(issuerQualification, /SET LOCAL ROLE ghm_schema_owner/);
});

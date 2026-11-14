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

const rollback = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/cutovers/20261112020000_authentication_issuer_privilege_rollback.sql',
), 'utf8');

test('issuer manual cutover explicitly denies schema object creation', () => {
  assert.match(issuerCutover, /REVOKE CREATE ON SCHEMA ghm FROM ghm_auth_issuer/);
});

test('issuer cutover qualification covers sequences and prevents issuer schema DDL', () => {
  const qualification = issuerQualification;
  assert.match(qualification, /has_sequence_privilege/);
  assert.match(qualification, /has_schema_privilege\(session_user, 'ghm', 'CREATE'\)/);
  assert.match(qualification, /issuer must not receive direct privileges on any GHM sequence/);
});

test('database rollback revokes issuer authority and restores only reviewed Resource API auth grants', () => {
  assert.match(rollback, /REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ghm FROM ghm_auth_issuer/);
  assert.match(rollback, /REVOKE USAGE ON SCHEMA ghm FROM ghm_auth_issuer/);
  for (const functionName of [
    'auth_create_account',
    'auth_lookup_password_by_normalized_email',
    'auth_set_password',
    'auth_rehash_password_if_unchanged',
    'auth_create_session_with_refresh',
    'auth_validate_session',
    'auth_rotate_refresh',
    'auth_revoke_by_refresh_hash',
    'auth_issue_recovery',
    'auth_redeem_recovery',
    'auth_redeem_recovery_with_count',
    'auth_reset_password_with_recovery',
    'auth_lookup_quoteflow_migration_reset_enrollment',
    'auth_complete_quoteflow_migration_reset',
  ]) {
    const grantIndex = rollback.indexOf(`GRANT EXECUTE ON FUNCTION ghm.${functionName}(`);
    assert.notEqual(grantIndex, -1, `missing rollback grant for ${functionName}`);
    assert.match(rollback.slice(grantIndex, grantIndex + 300), /TO ghm_runtime/);
  }
  assert.doesNotMatch(rollback, /auth_register_quoteflow_migration_reset_enrollment/);
  assert.doesNotMatch(rollback, /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL) ON (?:TABLE|SEQUENCE)/i);
});

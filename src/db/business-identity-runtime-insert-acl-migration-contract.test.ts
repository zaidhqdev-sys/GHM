import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('database/migrations/20261116200000_narrow_business_identity_runtime_insert.sql', 'utf8');
const repository = fs.readFileSync('src/resources/business-identity/repository.ts', 'utf8');

test('Business INSERT privileges are narrowed from table-level to repository-required columns', () => {
  assert.match(migration, /REVOKE INSERT ON TABLE ghm\.business FROM ghm_runtime/);
  assert.match(migration, /GRANT INSERT \(name, slug, verification_status, is_active\)\s+ON TABLE ghm\.business\s+TO ghm_runtime/);
  assert.match(migration, /REVOKE INSERT ON TABLE ghm\.business_membership FROM ghm_runtime/);
  assert.match(migration, /GRANT INSERT \(\s*business_id,\s*account_id,\s*membership_role,\s*membership_status,\s*created_by\s*\)\s+ON TABLE ghm\.business_membership\s+TO ghm_runtime/);
});

test('Business creation repository inserts only the approved Business and membership fields', () => {
  assert.match(repository, /INSERT INTO ghm\.business \(name, slug, verification_status, is_active\)/);
  assert.match(repository, /INSERT INTO ghm\.business_membership \(business_id, account_id, membership_role, membership_status, created_by\)/);
  assert.match(repository, /VALUES \(\$1, \$2, 'unverified', true\)/);
  assert.match(repository, /VALUES \(\$1, \$2, 'owner', 'active', \$2\)/);
});

test('migration leaves SELECT and identity-sequence privileges untouched', () => {
  assert.doesNotMatch(migration, /REVOKE\s+ALL|REVOKE\s+SELECT|REVOKE\s+USAGE|REVOKE\s+UPDATE|REVOKE\s+DELETE/i);
  assert.doesNotMatch(migration, /GRANT\s+ALL|GRANT\s+USAGE|GRANT\s+UPDATE|GRANT\s+DELETE/i);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('./audit-security-definer-authority.mjs', import.meta.url), 'utf8');

test('whole-database SECURITY DEFINER inventory is read-only and disposable-database restricted', () => {
  assert.match(source, /GHM_SECURITY_DEFINER_AUDIT_DATABASE_URL/);
  assert.match(source, /ghm_disposable_test/);
  assert.match(source, /localhost.*127\.0\.0\.1/);
  assert.match(source, /mutation: false/);
  assert.match(source, /REVIEW_REQUIRED_NO_AUTOMATIC_APPROVAL/);
  assert.doesNotMatch(source, /\\b(?:GRANT|REVOKE|ALTER ROLE|CREATE ROLE|DROP ROLE|CREATE FUNCTION|ALTER FUNCTION|DROP FUNCTION)\\b/i);
});

test('inventory covers non-system SECURITY DEFINER routines, direct ACLs and effective role grants', () => {
  assert.match(source, /p\.prosecdef/);
  assert.match(source, /pg_get_functiondef\(p\.oid\)/);
  assert.match(source, /aclexplode\(COALESCE\(p\.proacl/);
  assert.match(source, /has_function_privilege\(r\.oid, p\.oid, 'EXECUTE'\)/);
  assert.match(source, /pg_extension/);
  assert.match(source, /pg_auth_members/);
  assert.match(source, /pg_default_acl/);
  assert.match(source, /information_schema/);
  assert.match(source, /pg_%/);
});

test('inventory distinguishes PUBLIC, owner and other direct grantees and reports grant options', () => {
  assert.match(source, /'PUBLIC'/);
  assert.match(source, /'grantable', acl\.is_grantable/);
  assert.match(source, /'grantor', grantor_role\.rolname/);
  assert.match(source, /'grantee', CASE WHEN acl\.grantee = 0/);
});

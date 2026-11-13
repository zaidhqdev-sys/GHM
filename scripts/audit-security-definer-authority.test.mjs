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
  assert.doesNotMatch(source, /(?:^|\n)\s*(?:GRANT|REVOKE|ALTER\s+ROLE|CREATE\s+ROLE|DROP\s+ROLE|CREATE\s+FUNCTION|ALTER\s+FUNCTION|DROP\s+FUNCTION)\s+/i);
});

test('inventory covers non-system SECURITY DEFINER routines, direct ACLs and effective role grants', () => {
  assert.match(source, /p\.prosecdef/);
  assert.match(source, /pg_get_functiondef\(p\.oid\)/);
  assert.match(source, /aclexplode\(COALESCE\(p\.proacl/);
  assert.match(source, /has_function_privilege\(r\.oid, p\.oid, 'EXECUTE'\)/);
  assert.match(source, /effectiveNonOwnerRoles/);
  assert.match(source, /effective_non_owner_execute_roles: effectiveNonOwnerRoles/);
  assert.match(source, /'superuser', r\.rolsuper/);
  assert.match(source, /entry\.superuser !== true/);
  assert.match(source, /effective_superuser_roles_excluded_from_acl_findings/);
  assert.match(source, /pg_extension/);
  assert.match(source, /pg_auth_members/);
  assert.match(source, /pg_default_acl/);
  assert.match(source, /pg_attribute/);
  assert.match(source, /a\.attacl/);
  assert.match(source, /aclexplode\(a\.attacl\)/);
  assert.match(source, /has_column_privilege\(r\.oid, a\.attrelid, a\.attnum, 'INSERT'\)/);
  assert.match(source, /has_column_privilege\(r\.oid, a\.attrelid, a\.attnum, 'UPDATE'\)/);
  assert.match(source, /column_privileges: columnPrivileges/);
  assert.match(source, /pg_roles/);
  assert.match(source, /pg_namespace/);
  assert.match(source, /pg_database/);
  assert.match(source, /pg_language/);
  assert.match(source, /lanpltrusted/);
  assert.match(source, /role_attributes: roles/);
  assert.match(source, /schema_privileges: schemas/);
  assert.match(source, /database_privileges: databaseAcls/);
  assert.match(source, /information_schema/);
  assert.match(source, /pg_%/);
});

test('inventory distinguishes PUBLIC, owner and other direct grantees and reports grant options', () => {
  assert.match(source, /'PUBLIC'/);
  assert.match(source, /'grantable', acl\.is_grantable/);
  assert.match(source, /'grantor', grantor_role\.rolname/);
  assert.match(source, /'grantee', CASE WHEN acl\.grantee = 0/);
  assert.match(source, /untrustedLanguage/);
  assert.match(source, /trusted_language: !untrustedLanguage/);
});

const issuerCutoverSource = fs.readFileSync(new URL('./qualify-auth-issuer-cutover.mjs', import.meta.url), 'utf8');
const issuerPrivilegeSource = fs.readFileSync(new URL('../src/auth-issuer/database-privileges.ts', import.meta.url), 'utf8');
const issuerPrincipalSource = fs.readFileSync(new URL('./qualify-auth-issuer-principal.mjs', import.meta.url), 'utf8');

test('issuer qualification uses PostgreSQL-safe auth function prefix predicates', () => {
  for (const [name, source] of [
    ['issuer cutover qualification', issuerCutoverSource],
    ['issuer privilege helper', issuerPrivilegeSource],
    ['issuer principal qualification', issuerPrincipalSource],
  ]) {
    assert.doesNotMatch(
      source,
      /\bLIKE\b[\s\S]{0,120}\bESCAPE\b/i,
      `${name} must not use fragile LIKE/ESCAPE SQL prefix filters`,
    );
  }

  assert.ok(
    (issuerCutoverSource.match(/left\(p\.proname, 5\) = 'auth_'/g) ?? []).length >= 6,
    'issuer cutover must use explicit PostgreSQL-safe auth_ prefix checks at all reviewed call sites',
  );
  assert.match(
    issuerPrivilegeSource,
    /left\(p\.proname, 5\) = 'auth_'/,
    'issuer privilege inventory must use the PostgreSQL-safe auth_ prefix predicate',
  );
  assert.match(
    issuerPrincipalSource,
    /left\(p\.proname, 5\) = 'auth_'/,
    'issuer principal qualification must use the PostgreSQL-safe auth_ prefix predicate',
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { compareInventories } from './compare-security-definer-authority-inventories.mjs';

const fn = (name, schema = 'ghm') => ({
  schema_name: schema,
  function_name: name,
  identity_signature: `${schema}.${name}(bigint)`,
  owner: 'ghm_schema_owner',
  definition: `CREATE FUNCTION ${schema}.${name}(bigint) ...`,
  security_definer: true,
  function_settings: ['search_path=pg_catalog, ghm, pg_temp'],
  direct_acl: [{ grantee: 'ghm_schema_owner', privilege: 'EXECUTE', grantable: false }],
  effective_execute_roles: [{ role: 'ghm_schema_owner', superuser: false }],
});

const report = (functions) => ({
  audit: 'GHM SECURITY DEFINER whole-database catalog inventory',
  version: 1,
  mutation: false,
  server: { database_name: 'ghm_disposable_test', server_version: '18.0', server_version_num: '180000' },
  routine_count: functions.length,
  functions,
  role_memberships: [],
  role_attributes: [],
  schema_privileges: [],
  database_privileges: [],
  column_privileges: [],
  function_default_acls: [],
  preliminary_findings: [],
});

test('accepts issuer ACL-only changes while preserving all non-issuer authority', () => {
  const beforeIssuer = fn('auth_create_account');
  const afterIssuer = {
    ...beforeIssuer,
    direct_acl: [
      { grantee: 'ghm_schema_owner', privilege: 'EXECUTE', grantable: false },
      { grantee: 'ghm_auth_issuer', privilege: 'EXECUTE', grantable: false },
    ],
    effective_execute_roles: [
      { role: 'ghm_schema_owner', superuser: false },
      { role: 'ghm_auth_issuer', superuser: false },
    ],
  };
  const beforeRuntime = fn('read_project', 'ghm');
  const afterRuntime = structuredClone(beforeRuntime);
  const result = compareInventories(
    report([beforeIssuer, beforeRuntime]),
    report([afterIssuer, afterRuntime]),
  );
  assert.equal(result.issuerAclChangesObserved, 1);
  assert.equal(result.unexplainedNonIssuerChanges, 0);
});

test('rejects non-issuer function ACL or definition changes', () => {
  const before = fn('read_project');
  const after = { ...before, direct_acl: [{ grantee: 'PUBLIC', privilege: 'EXECUTE', grantable: false }] };
  assert.throws(() => compareInventories(report([before]), report([after])), /non-issuer SECURITY DEFINER function changed/);
});

test('rejects role membership changes', () => {
  const before = report([fn('auth_create_account')]);
  const after = report([{
    ...fn('auth_create_account'),
    direct_acl: [{ grantee: 'ghm_auth_issuer', privilege: 'EXECUTE', grantable: false }],
  }]);
  after.role_memberships = [{ member: 'ghm_runtime', granted_role: 'ghm_schema_owner' }];
  assert.throws(() => compareInventories(before, after), /role_memberships/);
});

test('rejects changes to issuer function definitions or ownership', () => {
  const before = report([fn('auth_create_account')]);
  const after = report([{ ...fn('auth_create_account'), owner: 'ghm_auth_issuer' }]);
  assert.throws(() => compareInventories(before, after), /non-ACL definition\/ownership metadata/);
});

test('rejects missing or added SECURITY DEFINER routine identities', () => {
  assert.throws(
    () => compareInventories(report([fn('auth_create_account')]), report([fn('auth_create_account'), fn('read_project')])),
    /routine_count/,
  );
});

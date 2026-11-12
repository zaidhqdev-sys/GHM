import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const server = fs.readFileSync(path.resolve(process.cwd(), 'src/auth-issuer/server.ts'), 'utf8');
const privilegeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/auth-issuer/database-privileges.ts'), 'utf8');
const qualificationSource = fs.readFileSync(path.resolve(process.cwd(), 'scripts/qualify-auth-issuer-cutover.mjs'), 'utf8');
const privilegeCutover = fs.readFileSync(path.resolve(process.cwd(), 'database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql'), 'utf8');

test('issuer verifies its exact database ACL boundary before opening the HTTP listener', () => {
  const verifierCall = server.indexOf('assertAuthIssuerDatabasePrivileges(databasePrivileges)');
  const listen = server.indexOf('server.listen(port');
  assert.ok(verifierCall >= 0 && listen > verifierCall, 'database ACL verification must precede server.listen');
  assert.match(server, /readinessCheck: async/);
  assert.match(server, /const currentPrivileges = await readAuthIssuerDatabasePrivileges\(pool\)/);
  assert.match(server, /assertAuthIssuerDatabaseIdentity\(databaseIdentity\)/, 'exact database identity must be enforced before the HTTP listener opens');
  assert.match(server, /m\.member = r\.oid/);
  assert.match(server, /member_role\.rolname <> 'ghm_db_user'/);
  assert.match(server, /m\.admin_option IS DISTINCT FROM true/);
  assert.match(server, /m\.inherit_option IS DISTINCT FROM false/);
  assert.match(server, /m\.set_option IS DISTINCT FROM false/);
  assert.match(server, /assertAuthIssuerDatabasePrivileges\(currentPrivileges\)/);
  assert.match(privilegeSource, /has_database_privilege\(session_user, current_database\(\), 'CONNECT'\)/);
  assert.match(privilegeSource, /has_database_privilege\(session_user, current_database\(\), 'CREATE'\)/);
  assert.match(privilegeSource, /has_schema_privilege\(session_user, 'ghm', 'CREATE'\)/);
  assert.match(privilegeSource, /has_table_privilege\(session_user/);
  assert.match(privilegeSource, /has_sequence_privilege\(session_user/);
  assert.match(privilegeSource, /has_function_privilege\(session_user/);
  assert.match(privilegeSource, /p\.prorettype <> 'trigger'::regtype/, 'callable-function allow-list must exclude trigger-returning functions');
  assert.match(privilegeSource, /runtime_executable_auth_functions/);
  assert.match(privilegeSource, /expected_runtime_auth_functions/);
  assert.match(privilegeSource, /ghm\.auth_lookup_external_identity/);
  assert.doesNotMatch(privilegeSource, /ghm\.auth_link_business_external_mapping/, 'business mapping mutation must not remain in runtime auth allow-list after signed gateway cutover');
  assert.match(privilegeSource, /ghm\.auth_lookup_business_external_mapping/);
  assert.match(privilegeSource, /pg_default_acl/);
});


test('issuer startup and manual cutover allow only the Render administrator as a role member', () => {
  assert.match(server, /member_role\.rolname <> 'ghm_db_user'/);
  assert.match(privilegeCutover, /m\.member = issuer_role\.oid/);
  assert.match(privilegeCutover, /member_role\.rolname <> 'ghm_db_user'/);
  assert.match(privilegeCutover, /m\.admin_option IS DISTINCT FROM true/);
  assert.match(privilegeCutover, /m\.inherit_option IS DISTINCT FROM false/);
  assert.match(privilegeCutover, /m\.set_option IS DISTINCT FROM false/);
  assert.match(privilegeCutover, /m\.roleid = issuer_role\.oid/);
});

test('issuer verifier checks every SECURITY DEFINER owner and pinned temporary-safe search_path', () => {
  assert.ok(privilegeSource.includes('unsafe_security_definer_functions'));
  assert.ok(privilegeSource.includes("pg_get_userbyid(p.proowner) IS DISTINCT FROM 'ghm_schema_owner'"));
  assert.ok(privilegeSource.includes("search_path=pg_catalog, ghm, pg_temp"));
});


test('issuer verifier rejects direct EXECUTE grants to every non-owner grantee outside the issuer', () => {
  assert.ok(privilegeSource.includes('unsafe_function_grantees'));
  assert.ok(privilegeSource.includes("acl.grantee <> 'ghm_auth_issuer'::regrole"));
  assert.ok(privilegeSource.includes('aclexplode(COALESCE(p.proacl'));
});


test('disposable qualification probes and cleans up unexpected issuer function grants', () => {
  assert.ok(qualificationSource.includes('TO ghm_payment_provider'));
  assert.ok(qualificationSource.includes('issuerWithUnexpectedGrant.unsafe_function_grantees'));
  assert.ok(qualificationSource.includes('issuerAclAfterDirectProbe.unsafe_function_grantees'));
});


test('issuer default ACL verifier requires the global default ACL row, not merely a schema override', () => {
  assert.match(privilegeSource, /NOT EXISTS \([\s\S]{0,240}defaclnamespace = 0[\s\S]{0,100}defaclobjtype = 'f'/);
});

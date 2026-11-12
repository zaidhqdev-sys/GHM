import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const server = fs.readFileSync(path.resolve(process.cwd(), 'src/actor-gateway/server.ts'), 'utf8');
const privilegeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/actor-gateway/database-privileges.ts'), 'utf8');
const qualificationSource = fs.readFileSync(path.resolve(process.cwd(), 'scripts/qualify-auth-issuer-cutover.mjs'), 'utf8');

test('Actor Gateway verifies its exact database ACL before opening the HTTP listener', () => {
  const identityCheck = server.indexOf('assertActorGatewayDatabaseIdentity(identity.rows[0])');
  const privilegeCheck = server.indexOf('assertActorGatewayDatabasePrivileges(databasePrivileges)');
  const listen = server.indexOf('server.listen(port');
  assert.ok(identityCheck >= 0 && privilegeCheck > identityCheck && listen > privilegeCheck);
  assert.match(server, /readActorGatewayDatabasePrivileges\(pool\)/);
  assert.match(server, /m\.member = r\\.oid/);
  assert.match(server, /m\.roleid = r\\.oid AND member_role\.rolname <> 'ghm_db_user'/);
  assert.match(privilegeSource, /has_database_privilege\(session_user, current_database\(\), 'CONNECT'\)/);
  assert.match(privilegeSource, /has_database_privilege\(session_user, current_database\(\), 'CREATE'\)/);
  assert.match(privilegeSource, /has_schema_privilege\(session_user, 'ghm', 'CREATE'\)/);
  assert.match(privilegeSource, /has_table_privilege\(session_user/);
  assert.match(privilegeSource, /has_sequence_privilege\(session_user/);
  assert.match(privilegeSource, /has_function_privilege\(session_user/);
  assert.match(privilegeSource, /public_executable_functions/);
  assert.match(privilegeSource, /runtime_executable_functions/);
  assert.match(privilegeSource, /pg_default_acl/);
  assert.match(privilegeSource, /defaclnamespace = 0 OR d\.defaclnamespace = 'ghm'::regnamespace/);
  assert.match(privilegeSource, /ghm\.gateway_submit_business_capability_evidence/);
  assert.match(privilegeSource, /ghm\.gateway_delete_saved_business/);
  assert.match(privilegeSource, /ghm\.gateway_get_business_hours/);
  assert.match(privilegeSource, /ghm\.gateway_get_trust_score/);
  assert.match(privilegeSource, /ghm\.gateway_list_trust_scores/);
  assert.match(privilegeSource, /ghm\.gateway_provision_connect_business/);
  assert.match(privilegeSource, /ghm\.gateway_update_business_profile/);
  assert.match(privilegeSource, /ghm\.gateway_storage_create_pending/);
  assert.match(privilegeSource, /ghm\.gateway_storage_get_object/);
  assert.match(privilegeSource, /ghm\.gateway_storage_mark_deletion_pending/);
  assert.match(privilegeSource, /ghm\.gateway_storage_mark_available/);
  assert.match(privilegeSource, /ghm\.gateway_storage_mark_deleted/);
});


test('Actor Gateway default ACL verifier rejects EXECUTE granted to any non-owner role', () => {
  assert.ok(privilegeSource.includes('acl.grantee <> d.defaclrole'));
});


test('disposable qualification proves Actor Gateway rejects unexpected schema-scoped default grants', () => {
  assert.ok(qualificationSource.includes('actorWithUnexpectedDefault.unsafe_function_defaults'));
  assert.ok(qualificationSource.includes('IN SCHEMA ghm GRANT EXECUTE ON FUNCTIONS TO postgres'));
});


test('Actor Gateway verifier checks every SECURITY DEFINER owner and pinned temporary-safe search_path', () => {
  assert.ok(privilegeSource.includes('unsafe_security_definer_functions'));
  assert.ok(privilegeSource.includes("pg_get_userbyid(p.proowner) IS DISTINCT FROM 'ghm_schema_owner'"));
  assert.ok(privilegeSource.includes("search_path=pg_catalog, ghm, pg_temp"));
});


test('Actor Gateway verifier rejects direct EXECUTE grants to every non-owner grantee outside the gateway', () => {
  assert.ok(privilegeSource.includes('unsafe_function_grantees'));
  assert.ok(privilegeSource.includes("acl.grantee <> 'ghm_actor_gateway'::regrole"));
  assert.ok(privilegeSource.includes('aclexplode(COALESCE(f.proacl'));
});


test('disposable qualification probes and cleans up unexpected Actor Gateway function grants', () => {
  assert.ok(qualificationSource.includes('actorWithUnexpectedGrant.unsafe_function_grantees'));
  assert.ok(qualificationSource.includes('actorAclAfterDirectProbe.unsafe_function_grantees'));
  assert.ok(qualificationSource.includes('REVOKE EXECUTE ON FUNCTION ghm.gateway_provision_connect_business'));
});


test('Actor Gateway default ACL verifier requires the global default ACL row, not merely a schema override', () => {
  assert.match(privilegeSource, /NOT EXISTS \([\s\S]{0,240}defaclnamespace = 0[\s\S]{0,100}defaclobjtype = 'f'/);
});


test('Actor Gateway qualification proves PUBLIC cannot execute SECURITY DEFINER operations', () => {
  assert.ok(qualificationSource.includes('public_executable_security_definer_functions'));
  assert.ok(qualificationSource.includes('issuerPublicDefiner'));
  assert.ok(qualificationSource.includes('actorPublicDefiner'));
  assert.ok(qualificationSource.includes('FROM PUBLIC'));
});

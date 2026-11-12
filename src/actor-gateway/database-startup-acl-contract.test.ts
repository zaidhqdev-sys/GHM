import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const server = fs.readFileSync(path.resolve(process.cwd(), 'src/actor-gateway/server.ts'), 'utf8');
const privilegeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/actor-gateway/database-privileges.ts'), 'utf8');

test('Actor Gateway verifies its exact database ACL before opening the HTTP listener', () => {
  const identityCheck = server.indexOf('assertActorGatewayDatabaseIdentity(identity.rows[0])');
  const privilegeCheck = server.indexOf('assertActorGatewayDatabasePrivileges(databasePrivileges)');
  const listen = server.indexOf('server.listen(port');
  assert.ok(identityCheck >= 0 && privilegeCheck > identityCheck && listen > privilegeCheck);
  assert.match(server, /readActorGatewayDatabasePrivileges\(pool\)/);
  assert.match(privilegeSource, /has_schema_privilege\(session_user, 'ghm', 'CREATE'\)/);
  assert.match(privilegeSource, /has_table_privilege\(session_user/);
  assert.match(privilegeSource, /has_sequence_privilege\(session_user/);
  assert.match(privilegeSource, /has_function_privilege\(session_user/);
  assert.match(privilegeSource, /public_executable_functions/);
  assert.match(privilegeSource, /runtime_executable_functions/);
  assert.match(privilegeSource, /pg_default_acl/);
  assert.match(privilegeSource, /ghm_migrator/);
  assert.match(privilegeSource, /ghm_payment_provider/);
  assert.match(privilegeSource, /ghm\.gateway_submit_business_capability_evidence/);
  assert.match(privilegeSource, /ghm\.gateway_delete_saved_business/);
  assert.match(privilegeSource, /ghm\.gateway_get_business_hours/);
  assert.match(privilegeSource, /ghm\.gateway_get_trust_score/);
  assert.match(privilegeSource, /ghm\.gateway_list_trust_scores/);
  assert.match(privilegeSource, /ghm\.gateway_update_business_profile/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const server = fs.readFileSync(path.resolve(process.cwd(), 'src/auth-issuer/server.ts'), 'utf8');
const privilegeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/auth-issuer/database-privileges.ts'), 'utf8');

test('issuer verifies its exact database ACL boundary before opening the HTTP listener', () => {
  const verifierCall = server.indexOf('assertAuthIssuerDatabasePrivileges(databasePrivileges)');
  const listen = server.indexOf('server.listen(port');
  assert.ok(verifierCall >= 0 && listen > verifierCall, 'database ACL verification must precede server.listen');
  assert.match(server, /readinessCheck: async/);
  assert.match(server, /const currentPrivileges = await readAuthIssuerDatabasePrivileges\(pool\)/);
  assert.match(server, /assertAuthIssuerDatabaseIdentity\(databaseIdentity\)/, 'exact database identity must be enforced before the HTTP listener opens');
  assert.match(server, /assertAuthIssuerDatabasePrivileges\(currentPrivileges\)/);
  assert.match(privilegeSource, /has_schema_privilege\(session_user, 'ghm', 'CREATE'\)/);
  assert.match(privilegeSource, /has_table_privilege\(session_user/);
  assert.match(privilegeSource, /has_sequence_privilege\(session_user/);
  assert.match(privilegeSource, /has_function_privilege\(session_user/);
  assert.match(privilegeSource, /p\.prorettype <> 'trigger'::regtype/, 'callable-function allow-list must exclude trigger-returning functions');
  assert.match(privilegeSource, /runtime_executable_auth_functions/);
  assert.match(privilegeSource, /expected_runtime_auth_functions/);
  assert.match(privilegeSource, /ghm\.auth_lookup_external_identity/);
  assert.match(privilegeSource, /ghm\.auth_link_business_external_mapping/);
  assert.match(privilegeSource, /ghm\.auth_lookup_business_external_mapping/);
  assert.match(privilegeSource, /pg_default_acl/);
});

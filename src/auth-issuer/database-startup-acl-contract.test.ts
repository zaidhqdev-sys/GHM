import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const server = fs.readFileSync(path.resolve(process.cwd(), 'src/auth-issuer/server.ts'), 'utf8');

test('issuer verifies its exact database ACL boundary before opening the HTTP listener', () => {
  const verifier = server.indexOf('assertAuthIssuerDatabasePrivileges(databasePrivileges)');
  const listen = server.indexOf('server.listen(port');
  assert.ok(verifier >= 0 && listen > verifier, 'database ACL verification must precede server.listen');
  assert.match(server, /has_schema_privilege\(session_user, 'ghm', 'CREATE'\)/);
  assert.match(server, /has_table_privilege\(session_user/);
  assert.match(server, /has_sequence_privilege\(session_user/);
  assert.match(server, /has_function_privilege\(session_user/);
  assert.match(server, /runtime_executable_auth_functions/);
  assert.match(server, /expected_runtime_auth_functions/);
  assert.match(server, /ghm\.auth_lookup_external_identity/);
  assert.match(server, /ghm\.auth_link_business_external_mapping/);
  assert.match(server, /ghm\.auth_lookup_business_external_mapping/);
  assert.match(server, /pg_default_acl/);
});

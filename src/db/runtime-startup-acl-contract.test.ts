import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const server = fs.readFileSync(path.resolve(process.cwd(), 'src/server.ts'), 'utf8');

test('Resource API verifies database CONNECT and schema usage without CREATE before listening', () => {
  const identityCheck = server.indexOf('assertRuntimeDatabaseIdentity(identity.rows[0])');
  const listen = server.indexOf('server.listen(config.port');
  assert.ok(identityCheck >= 0 && listen > identityCheck, 'runtime identity and ACL checks must precede server.listen');
  assert.match(server, /has_database_privilege\(session_user, current_database\(\), 'CONNECT'\)/);
  assert.match(server, /has_database_privilege\(session_user, current_database\(\), 'CREATE'\)/);
  assert.match(server, /has_schema_privilege\(session_user, 'ghm', 'USAGE'\)/);
  assert.match(server, /has_schema_privilege\(session_user, 'ghm', 'CREATE'\)/);
  assert.match(server, /NOT EXISTS\s*\([\s\S]*FROM pg_auth_members/);
  assert.match(server, /m\\.member = r\\.oid/);
  assert.match(server, /m\\.roleid = r\\.oid AND member_role\\.rolname <> 'ghm_db_user'/);
});


test('Resource API verifies exact function EXECUTE allow-list before listening', () => {
  const functionCheck = server.indexOf('assertRuntimeDatabaseFunctionPrivileges(functionPrivileges)');
  const listen = server.indexOf('server.listen(config.port');
  assert.ok(functionCheck >= 0 && listen > functionCheck, 'function EXECUTE allow-list must be checked before server.listen');
  assert.match(server, /readRuntimeDatabaseFunctionPrivileges\(pool\)/);
  assert.match(server, /GHM_RUNTIME_FUNCTION_ALLOWLIST_ENFORCED === 'true'/);
  assert.match(server, /production_acl_baseline_not_yet_independently_qualified/);
});

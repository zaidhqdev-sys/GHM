import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261110210000_add_actor_gateway_principal_guard.sql'), 'utf8');

test('Actor Gateway migration allows only the bounded Render administrator membership', () => {
  assert.match(migration, /m\.member = gateway_oid/);
  assert.match(migration, /m\.roleid = gateway_oid/);
  assert.match(migration, /member_role\.rolname <> 'ghm_db_user'/);
  assert.match(migration, /m\.admin_option IS DISTINCT FROM true/);
  assert.match(migration, /m\.inherit_option IS DISTINCT FROM false/);
  assert.match(migration, /m\.set_option IS DISTINCT FROM false/);
});

test('Actor Gateway migration continues to reject elevated role attributes', () => {
  for (const flag of ['rolcanlogin', 'rolinherit', 'rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls']) {
    assert.ok(migration.includes(`gateway_role.${flag}`), `expected guard for ${flag}`);
  }
});

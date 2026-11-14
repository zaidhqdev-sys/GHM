import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261110210000_add_actor_gateway_principal_guard.sql', 'utf8');

test('Actor Gateway principal guard permits only the bounded Render administrator membership', () => {
  assert.match(migration, /(?:m\.)?member\s*=\s*gateway_oid/);
  assert.match(migration, /(?:m\.)?roleid\s*=\s*gateway_oid/);
  assert.match(migration, /to_regrole\('ghm_db_user'\) IS NULL/);
  assert.match(migration, /trusted_admin_oid/);
  assert.match(migration, /(?:admin_option IS (?:DISTINCT FROM true|TRUE)|AND admin_option\b)/);
  assert.match(migration, /(?:inherit_option IS (?:DISTINCT FROM false|FALSE)|AND NOT inherit_option\b)/);
  assert.match(migration, /(?:set_option IS (?:DISTINCT FROM false|FALSE)|AND NOT set_option\b)/);
  assert.match(migration, /ghm_db_user.*ADMIN OPTION|bounded ghm_db_user administrative membership/);
});

test('Actor Gateway principal guard continues to reject elevated login attributes', () => {
  for (const flag of ['rolcanlogin', 'rolinherit', 'rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolbypassrls']) {
    assert.ok(migration.includes(`gateway_role.${flag}`), `expected guard for ${flag}`);
  }
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync(join(process.cwd(), 'database/migrations/20261016190000_expose_authenticated_account_email.sql'), 'utf8');

test('account email is exposed through a narrow SECURITY DEFINER function', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION ghm\.auth_read_account_email\(p_account_id bigint\)/i);
  assert.match(migration, /RETURNS text[\s\S]*?SECURITY DEFINER/i);
  assert.match(migration, /SET search_path = pg_catalog, ghm/i);
  assert.match(migration, /credential\.account_id = p_account_id/i);
  assert.match(migration, /credential\.credential_status = 'active'/i);
});

test('account email function is not public and runtime receives function-only access', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.auth_read_account_email\(bigint\) FROM PUBLIC/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.auth_read_account_email\(bigint\) TO ghm_runtime/i);
  assert.match(migration, /never accept an arbitrary account ID from browser input/i);
  assert.doesNotMatch(migration, /GRANT SELECT ON TABLE ghm\.account_password_credential/i);
});

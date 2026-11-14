import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261110160000_add_admin_capability_catalogue_governance.sql', 'utf8');

test('capability catalogue governance functions are security-definer and independently verify admin authority', () => {
  assert.equal((migration.match(/SECURITY DEFINER/g) ?? []).length, 3);
  assert.equal((migration.match(/is_system_admin = true OR role = 'admin'/g) ?? []).length, 3);
  assert.match(migration, /account_status = 'active'/);
  assert.match(migration, /SET search_path = pg_catalog, ghm/);
  assert.match(migration, /FOR UPDATE/);
});

test('capability catalogue runtime receives function execution, not direct table DML', () => {
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.create_capability_draft/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.update_capability_draft/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.transition_capability_lifecycle/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE) ON ghm\.capability TO ghm_runtime/);
});

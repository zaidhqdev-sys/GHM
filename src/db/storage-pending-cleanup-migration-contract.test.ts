import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261110140000_allow_pending_storage_object_cleanup.sql', 'utf8');

test('pending and available storage objects can enter the deletion-pending cleanup state', () => {
  assert.match(migration, /status IN \('pending', 'available'\)/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, ghm/);
  assert.match(migration, /SET status = 'deletion_pending'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.storage_mark_deletion_pending\(bigint\) TO ghm_runtime/);
});

test('deletion-pending lifecycle preserves both pending and previously available timestamps', () => {
  assert.match(migration, /DROP CONSTRAINT storage_object_lifecycle_check/);
  assert.match(
    migration,
    /ADD CONSTRAINT storage_object_lifecycle_check CHECK \([\s\S]*?\(status = 'deletion_pending' AND deleted_at IS NULL\)/,
  );
  assert.doesNotMatch(
    migration,
    /\(status = 'deletion_pending' AND available_at IS NOT NULL AND deleted_at IS NULL\)/,
  );
  const update = migration.match(/UPDATE ghm\.storage_object[\s\S]*?RETURNING \* INTO v_row;/)?.[0];
  assert.ok(update, 'expected the deletion-pending UPDATE statement');
  assert.match(update, /SET status = 'deletion_pending'/);
  assert.doesNotMatch(update, /available_at\s*=|deleted_at\s*=/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261110140000_allow_pending_storage_object_cleanup.sql', 'utf8');

test('pending and available storage objects can enter the deletion-pending cleanup state', () => {
  assert.match(migration, /status IN \('pending', 'available'\)/);
  assert.match(migration, /SET status = 'deletion_pending'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.storage_mark_deletion_pending\(bigint\) TO ghm_runtime/);
});

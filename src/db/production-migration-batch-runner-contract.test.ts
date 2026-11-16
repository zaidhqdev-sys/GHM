import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const runner = fs.readFileSync('src/db/migrate.ts', 'utf8');

test('production runner selects a named batch instead of iterating every repository migration', () => {
  assert.match(runner, /selectProductionMigrationBatch\(/);
  assert.match(runner, /GHM_MIGRATION_BATCH_ID/);
  assert.match(runner, /for \(const migration of executionMigrations\)/);
  assert.doesNotMatch(runner, /for \(const migration of migrations\)\s*\{/);
});

test('production plan mode prints selected migrations and rolls back without executing SQL', () => {
  assert.match(runner, /GHM_MIGRATION_PLAN_ONLY === 'true'/);
  assert.match(runner, /Production migration plan \(no SQL executed\)/);
  assert.match(runner, /await client\.query\('ROLLBACK'\);\s*return;/);
});

test('production pending inventory and batch manifests are distinct configuration inputs', () => {
  assert.match(runner, /productionPendingMigrationInventory/);
  assert.match(runner, /productionMigrationBatches/);
  assert.doesNotMatch(runner, /assertProductionPendingMigrationAllowlist\(/);
});

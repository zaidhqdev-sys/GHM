import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const runner = fs.readFileSync('src/db/migrate.ts', 'utf8');

test('production runner selects a named batch and gates SQL execution to its versions', () => {
  assert.match(runner, /selectProductionMigrationBatch\(/);
  assert.match(runner, /GHM_MIGRATION_BATCH_ID/);
  assert.match(runner, /const executionVersions = new Set\(executionMigrations\.map/);
  assert.match(runner, /for \(const migration of migrations\)/);
  assert.match(runner, /if \(!executionVersions\.has\(migration\.version\)\) continue/);
});

test('all already-applied repository migrations retain checksum verification', () => {
  const checksumCheck = runner.indexOf('const existingChecksum = appliedByVersion.get(migration.version)');
  const executionGate = runner.indexOf('if (!executionVersions.has(migration.version)) continue');
  assert.ok(checksumCheck >= 0);
  assert.ok(executionGate > checksumCheck);
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

test('plan-only mode validates applied checksums before reporting the plan', () => {
  const checksumCheck = runner.indexOf('const existingChecksum = appliedByVersion.get(migration.version)');
  const planGate = runner.indexOf('if (planOnly)');
  const planOutput = runner.indexOf('Production migration plan (no SQL executed)');
  assert.ok(checksumCheck >= 0);
  assert.ok(planGate > checksumCheck);
  assert.ok(planOutput > planGate);
  assert.match(runner, /if \(planOnly\)[\s\S]*?await client\.query\('ROLLBACK'\);[\s\S]*?return;/);
});

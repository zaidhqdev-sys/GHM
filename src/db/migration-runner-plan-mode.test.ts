import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const runner = fs.readFileSync('src/db/migrate.ts', 'utf8');

test('production plan mode inventories the complete pending queue without requiring an execution batch', () => {
  assert.match(runner, /GHM_MIGRATION_PLAN_ONLY === 'true'/);
  assert.match(runner, /const executionMigrations = planOnly\s*\? pendingMigrations/);
  assert.match(runner, /if \(planOnly\) \{\s*plannedMigrations\.push\(migration\);\s*continue;/);
  assert.match(runner, /Production migration plan \(no SQL executed\)/);
  assert.ok(runner.includes('SHA-256 ${migration.checksum}'));
});

test('plan mode reports an empty queue and rolls back before returning', () => {
  assert.match(runner, /if \(plannedMigrations\.length === 0\) console\.log\('  No pending migrations\.'\)/);
  assert.match(runner, /await client\.query\('ROLLBACK'\);\s*return;/);
});

test('plan mode cannot be enabled for non-production targets', () => {
  assert.match(runner, /const planOnly = approvedTarget\.databaseName === 'ghm_db' &&\s*process\.env\.GHM_MIGRATION_PLAN_ONLY === 'true'/);
});

test('applied migration checksums are verified before plan output', () => {
  const checksumCheck = runner.indexOf('const existingChecksum = appliedByVersion.get(migration.version)');
  const planOutput = runner.indexOf('Production migration plan (no SQL executed)');
  assert.ok(checksumCheck >= 0);
  assert.ok(planOutput > checksumCheck);
});

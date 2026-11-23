import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const runner = fs.readFileSync('src/db/migrate.ts', 'utf8');

test('production migration execution requires the explicit contiguous batch selector', () => {
  assert.match(runner, /selectProductionMigrationBatch\(/);
  assert.match(runner, /process\.env\.GHM_MIGRATION_BATCH_ID/);
  assert.match(runner, /approvedTarget\.databaseName === 'ghm_db'/);
});

test('the production batch is selected before any migration SQL is executed', () => {
  const selection = runner.indexOf('const executionMigrations =');
  const execution = runner.indexOf('client.query(normalizeMigrationSqlForExecution');
  assert.ok(selection >= 0, 'production batch selection must be present');
  assert.ok(execution > selection, 'migration SQL execution must follow batch selection');
  assert.match(runner, /if \(!executionVersions\.has\(migration\.version\)\) continue;/);
});

test('the runner verifies applied ledger version/name identity before selecting a batch', () => {
  assert.match(runner, /SELECT version, name, checksum FROM \$\{ledgerTable\}/);
  assert.match(runner, /assertAppliedMigrationNames\(migrations, applied\.rows\)/);
});

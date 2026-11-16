import assert from 'node:assert/strict';
import test from 'node:test';
import { selectProductionMigrationBatch, type MigrationIdentity, type ProductionMigrationBatchConfig } from './production-migration-batch';

const migrations: MigrationIdentity[] = [
  { version: '20261110010000', name: 'first' },
  { version: '20261110100000', name: 'second' },
  { version: '20261110120000', name: 'third' },
];
const inventory = migrations.map((item) => ({ ...item }));
const config: ProductionMigrationBatchConfig = {
  batches: [{
    id: 'foundation-prefix',
    reason: 'A deliberately small, reviewed prefix for qualification tests',
    migrations: migrations.slice(0, 2),
  }],
};

test('requires an explicit named batch even when the inventory matches', () => {
  assert.throws(
    () => selectProductionMigrationBatch(migrations, new Set(), inventory, config, undefined),
    /requires GHM_MIGRATION_BATCH_ID/,
  );
});

test('selects only the exact contiguous prefix named by the batch', () => {
  assert.deepEqual(
    selectProductionMigrationBatch(migrations, new Set(), inventory, config, 'foundation-prefix'),
    migrations.slice(0, 2),
  );
});

test('rejects a stale or incomplete pending inventory', () => {
  assert.throws(
    () => selectProductionMigrationBatch(migrations, new Set(), inventory.slice(0, 2), config, 'foundation-prefix'),
    /inventory mismatch/,
  );
});

test('rejects a batch that skips an earlier pending migration', () => {
  const skipped: ProductionMigrationBatchConfig = {
    batches: [{ ...config.batches[0], migrations: [migrations[1]] }],
  };
  assert.throws(
    () => selectProductionMigrationBatch(migrations, new Set(), inventory, skipped, 'foundation-prefix'),
    /contiguous prefix/,
  );
});

test('rejects a batch whose identity differs from repository version/name', () => {
  const wrongName: ProductionMigrationBatchConfig = {
    batches: [{ ...config.batches[0], migrations: [{ ...migrations[0], name: 'wrong-name' }] }],
  };
  assert.throws(
    () => selectProductionMigrationBatch(migrations, new Set(), inventory, wrongName, 'foundation-prefix'),
    /contiguous prefix/,
  );
});

test('rejects duplicate batch ids and duplicate migration versions', () => {
  const duplicateId: ProductionMigrationBatchConfig = {
    batches: [...config.batches, { ...config.batches[0] }],
  };
  assert.throws(
    () => selectProductionMigrationBatch(migrations, new Set(), inventory, duplicateId, 'foundation-prefix'),
    /Duplicate production migration batch id/,
  );
  assert.throws(
    () => selectProductionMigrationBatch(
      migrations,
      new Set(),
      [{ ...inventory[0] }, { ...inventory[0] }],
      config,
      'foundation-prefix',
    ),
    /duplicate version/,
  );
});

test('applied migrations are excluded from the exact pending inventory and batch prefix', () => {
  assert.deepEqual(
    selectProductionMigrationBatch(migrations, new Set([migrations[0].version]), inventory.slice(1), {
      batches: [{ id: 'remaining-prefix', reason: 'test', migrations: migrations.slice(1, 2) }],
    }, 'remaining-prefix'),
    migrations.slice(1, 2),
  );
});

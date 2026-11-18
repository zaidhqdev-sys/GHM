import assert from 'node:assert/strict';
import test from 'node:test';
import { selectProductionMigrationBatch, type MigrationBatch } from './migration-batches';
import { assertProductionPendingMigrationAllowlist } from './production-pending-migration-allowlist';

const migrations = [
  { version: '20261110010000', name: 'first', checksum: 'a'.repeat(64) },
  { version: '20261110100000', name: 'second', checksum: 'b'.repeat(64) },
  { version: '20261110210000', name: 'third', checksum: 'c'.repeat(64) },
];
const batch = (entries: typeof migrations): MigrationBatch[] => [
  { id: 'gateway-foundation-01', purpose: 'Install reviewed gateway foundation', migrations: entries },
];

test('requires explicit committed batch ID', () =>
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set(), batch([migrations[0]]), undefined), /GHM_MIGRATION_BATCH_ID/));
test('rejects unknown IDs', () =>
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set(), [], 'missing'), /unknown execution batch/));
test('accepts exact contiguous pending prefix', () =>
  assert.deepEqual(selectProductionMigrationBatch(migrations, new Set(), batch(migrations.slice(0, 2)), 'gateway-foundation-01'), migrations.slice(0, 2)));
test('rejects skipped earlier pending migrations', () =>
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set(), batch([migrations[1]]), 'gateway-foundation-01'), /contiguous prefix/));
test('starts at first unapplied migration', () =>
  assert.deepEqual(selectProductionMigrationBatch(migrations, new Set([migrations[0].version]), batch(migrations.slice(1)), 'gateway-foundation-01'), migrations.slice(1)));
test('rejects already-applied and name-mismatched entries', () => {
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set([migrations[0].version]), batch([migrations[0]]), 'gateway-foundation-01'), /contiguous prefix/);
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set(), batch([{ ...migrations[0], name: 'wrong' }]), 'gateway-foundation-01'), /contiguous prefix/);
});
test('rejects duplicate versions and duplicate manifest IDs', () => {
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set(), batch([migrations[0], migrations[0]]), 'gateway-foundation-01'), /duplicate version/);
  const duplicateIds = [...batch([migrations[0]]), ...batch([migrations[0]])];
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set(), duplicateIds, 'gateway-foundation-01'), /duplicate batch ID/);
});
test('rejects malformed, unordered and duplicate repository migration identities', () => {
  assert.throws(() => selectProductionMigrationBatch([{ version: 'bad', name: 'first', checksum: 'a'.repeat(64) }], new Set(), batch([migrations[0]]), 'gateway-foundation-01'), /invalid migration identity/);
  assert.throws(() => selectProductionMigrationBatch([migrations[1], migrations[0]], new Set(), batch([migrations[0]]), 'gateway-foundation-01'), /strict version order/);
  assert.throws(() => selectProductionMigrationBatch([migrations[0], migrations[0]], new Set(), batch([migrations[0]]), 'gateway-foundation-01'), /duplicate version/);
});
test('rejects malformed batch IDs, missing purpose and empty batches', () => {
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set(), [{ id: 'Bad ID', purpose: 'x', migrations: [migrations[0]] }], 'Bad ID'), /invalid batch/);
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set(), [{ id: 'valid-id', purpose: ' ', migrations: [migrations[0]] }], 'valid-id'), /invalid batch/);
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set(), [{ id: 'valid-id', purpose: 'valid', migrations: [] }], 'valid-id'), /invalid batch/);
});

test('rejects changed SQL checksum under an unchanged version and name', () => {
  const changedSql = [{ ...migrations[0], checksum: 'd'.repeat(64) }];
  assert.throws(
    () => selectProductionMigrationBatch(migrations, new Set(), batch(changedSql), 'gateway-foundation-01'),
    /checksum mismatch.*20261110010000_first/,
  );
});
test('rejects malformed reviewed migration checksums', () => {
  const malformed = [{ ...migrations[0], checksum: 'not-a-sha256' }];
  assert.throws(
    () => selectProductionMigrationBatch(migrations, new Set(), batch(malformed), 'gateway-foundation-01'),
    /invalid migration identity/,
  );
});

test('rejects unordered batch identities', () =>
  assert.throws(() => selectProductionMigrationBatch(migrations, new Set(), batch([migrations[1], migrations[0]]), 'gateway-foundation-01'), /strict version order/));

test('production pending inventory must exactly match the current pending queue', () => {
  assert.doesNotThrow(() => assertProductionPendingMigrationAllowlist(migrations, new Set([migrations[0].version]), migrations.slice(1)));
});
test('production pending inventory rejects omitted pending migrations', () => {
  assert.throws(
    () => assertProductionPendingMigrationAllowlist(migrations, new Set([migrations[0].version]), [migrations[1]]),
    /inventory mismatch.*expected exact pending queue/,
  );
});
test('production pending inventory rejects already-applied stale entries', () => {
  assert.throws(
    () => assertProductionPendingMigrationAllowlist(migrations, new Set([migrations[0].version]), migrations),
    /stale[/]already-applied/,
  );
});
test('production pending inventory rejects reordered or renamed entries', () => {
  assert.throws(
    () => assertProductionPendingMigrationAllowlist(migrations, new Set(), [migrations[1], migrations[0], migrations[2]]),
    /exact repository order[/]name/,
  );
  assert.throws(
    () => assertProductionPendingMigrationAllowlist(migrations, new Set(), [{ ...migrations[0], name: 'renamed' }, ...migrations.slice(1)]),
    /does not match repository migration/,
  );
});

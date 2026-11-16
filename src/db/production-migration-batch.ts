export type MigrationIdentity = { version: string; name: string };
export type ProductionMigrationBatch = {
  id: string;
  reason: string;
  migrations: MigrationIdentity[];
};
export type ProductionMigrationBatchConfig = { batches: ProductionMigrationBatch[] };

const identityKey = ({ version, name }: MigrationIdentity): string => `${version}_${name}`;

const assertUniqueOrdered = (items: MigrationIdentity[], label: string): void => {
  const seen = new Set<string>();
  let previous = '';
  for (const item of items) {
    if (!/^\d{14}$/.test(item.version) || !/^[a-z0-9][a-z0-9_-]*$/.test(item.name)) {
      throw new Error(`${label} contains an invalid migration identity`);
    }
    if (seen.has(item.version)) throw new Error(`${label} contains duplicate version ${item.version}`);
    if (previous && item.version <= previous) throw new Error(`${label} is not in strict version order`);
    seen.add(item.version);
    previous = item.version;
  }
};

/**
 * Validates that the committed inventory exactly describes all repository
 * migrations not yet recorded in the live ledger. Inventory never authorizes
 * execution: a separate named batch must select a contiguous pending prefix.
 */
export const selectProductionMigrationBatch = (
  migrations: MigrationIdentity[],
  appliedVersions: ReadonlySet<string>,
  inventory: MigrationIdentity[],
  config: ProductionMigrationBatchConfig,
  batchId: string | undefined,
): MigrationIdentity[] => {
  assertUniqueOrdered(migrations, 'Repository migration list');
  assertUniqueOrdered(inventory, 'Production pending inventory');

  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));
  const expected = pending.map(identityKey);
  const actual = inventory.map(identityKey);
  if (expected.length !== actual.length || expected.some((identity, index) => identity !== actual[index])) {
    throw new Error('Production pending inventory mismatch: refusing migration execution; refresh and reconcile the committed inventory');
  }

  if (!Array.isArray(config.batches)) throw new Error('Production migration batch configuration must contain a batches array');
  const ids = new Set<string>();
  for (const batch of config.batches) {
    if (!batch || typeof batch.id !== 'string' || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(batch.id) ||
        typeof batch.reason !== 'string' || !batch.reason.trim() || !Array.isArray(batch.migrations) ||
        batch.migrations.length === 0) {
      throw new Error('Production migration batch manifest is invalid');
    }
    if (ids.has(batch.id)) throw new Error(`Duplicate production migration batch id: ${batch.id}`);
    ids.add(batch.id);
    assertUniqueOrdered(batch.migrations, `Batch ${batch.id}`);
  }

  if (!batchId) throw new Error('Production migration execution requires GHM_MIGRATION_BATCH_ID; inventory alone never authorizes execution');
  const selected = config.batches.find((batch) => batch.id === batchId);
  if (!selected) throw new Error(`Unknown production migration batch: ${batchId}`);

  const selectedIdentities = selected.migrations.map(identityKey);
  if (selectedIdentities.length > pending.length ||
      selectedIdentities.some((identity, index) => identity !== expected[index])) {
    throw new Error(`Production migration batch ${batchId} is not an exact contiguous prefix of the pending queue`);
  }
  return pending.slice(0, selected.migrations.length);
};

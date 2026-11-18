export type MigrationBatchEntry = { version: string; name: string };
export type MigrationBatch = { id: string; purpose: string; migrations: MigrationBatchEntry[] };

const identityKey = ({ version, name }: MigrationBatchEntry): string => `${version}_${name}`;

const assertUniqueOrdered = (entries: MigrationBatchEntry[], label: string): void => {
  if (!Array.isArray(entries)) throw new Error(`${label} must be an array`);
  const seen = new Set<string>();
  let previous = '';
  for (const entry of entries) {
    if (!entry || typeof entry.version !== 'string' || !/^\\d{14}$/.test(entry.version) ||
        typeof entry.name !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(entry.name)) {
      throw new Error(`${label} contains an invalid migration identity`);
    }
    if (seen.has(entry.version)) throw new Error(`${label} contains duplicate version ${entry.version}`);
    if (previous && entry.version <= previous) throw new Error(`${label} is not in strict version order`);
    seen.add(entry.version);
    previous = entry.version;
  }
};

/** Select a reviewed production batch: an exact contiguous prefix of the live pending queue. */
export const selectProductionMigrationBatch = (
  migrations: MigrationBatchEntry[],
  appliedVersions: ReadonlySet<string>,
  batches: MigrationBatch[],
  batchId: string | undefined,
): MigrationBatchEntry[] => {
  assertUniqueOrdered(migrations, 'Repository migration list');
  if (!Array.isArray(batches)) throw new Error('Production migration batch manifest must be an array');

  const ids = new Set<string>();
  for (const batch of batches) {
    if (!batch || typeof batch.id !== 'string' || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(batch.id) ||
        typeof batch.purpose !== 'string' || !batch.purpose.trim() ||
        !Array.isArray(batch.migrations) || batch.migrations.length === 0) {
      throw new Error('Production migration batch manifest contains an invalid batch');
    }
    if (ids.has(batch.id)) throw new Error(`Production migration batch manifest contains duplicate batch ID ${batch.id}`);
    ids.add(batch.id);
    assertUniqueOrdered(batch.migrations, `Production migration batch ${batch.id}`);
  }

  if (!batchId?.trim()) {
    throw new Error('Production migration refused: GHM_MIGRATION_BATCH_ID must identify a committed, reviewed execution batch');
  }
  const selected = batches.find((batch) => batch.id === batchId);
  if (!selected) throw new Error(`Production migration refused: unknown execution batch ${batchId}`);

  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));
  const selectedIdentities = selected.migrations.map(identityKey);
  const pendingPrefix = pending.slice(0, selected.migrations.length).map(identityKey);
  if (selectedIdentities.length > pending.length ||
      selectedIdentities.some((identity, index) => identity !== pendingPrefix[index])) {
    throw new Error(`Production migration batch ${batchId} is not an exact contiguous prefix of the pending queue`);
  }
  return pending.slice(0, selected.migrations.length);
};

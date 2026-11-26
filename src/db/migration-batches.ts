export type MigrationBatchEntry = { version: string; name: string; checksum: string };
export type MigrationBatch = { id: string; purpose: string; migrations: MigrationBatchEntry[] };

const identityKey = ({ version, name }: MigrationBatchEntry): string => `${version}_${name}`;

/**
 * Runtime revocations must never be committed without their signed Gateway
 * replacements in the same completed migration state. Because production
 * batches are contiguous prefixes, the replacement may be in a later batch,
 * but the cutover batch cannot be selected on its own.
 */
const REQUIRED_SIGNED_CUTOVER_REPLACEMENTS: Array<{ cutover: string; replacement: string }> = [
  {
    cutover: '20261110260000_gateway_supplier_classification_cutover',
    replacement: '20261111030000_bind_supplier_gateway_actor_to_signed_assertion',
  },
  {
    cutover: '20261110270000_gateway_business_profile_update',
    replacement: '20261111040000_bind_business_profile_gateway_actor_to_signed_assertion',
  },
];

const REQUIRED_ORDERED_MIGRATION_PAIRS: Array<{ first: string; requiredFollowing: string }> = [
  {
    first: '20261120010000_add_signed_business_capability_create',
    requiredFollowing: '20261120011000_allow_signed_business_capability_create_assertion',
  },
];

export const assertProductionMigrationBatchCutoverDependencies = (
  selectedEntries: MigrationBatchEntry[],
  appliedVersions: ReadonlySet<string>,
): void => {
  const selectedVersions = new Set(selectedEntries.map((entry) => entry.version));
  for (const dependency of REQUIRED_SIGNED_CUTOVER_REPLACEMENTS) {
    if (!appliedVersions.has(dependency.cutover.slice(0, 14)) &&
        !selectedVersions.has(dependency.cutover.slice(0, 14))) continue;
    if (!appliedVersions.has(dependency.replacement.slice(0, 14)) &&
        !selectedVersions.has(dependency.replacement.slice(0, 14))) {
      throw new Error(
        `Production migration batch would leave runtime cutover ${dependency.cutover} without signed replacement ${dependency.replacement}`,
      );
    }
  }

  const completedVersions = new Set([...appliedVersions, ...selectedVersions]);
  for (const dependency of REQUIRED_ORDERED_MIGRATION_PAIRS) {
    if (!completedVersions.has(dependency.first.slice(0, 14))) continue;
    if (!completedVersions.has(dependency.requiredFollowing.slice(0, 14))) {
      throw new Error(
        `Production migration batch would include ${dependency.first} without required following migration ${dependency.requiredFollowing}`,
      );
    }
  }
};

const assertUniqueOrdered = (entries: MigrationBatchEntry[], label: string): void => {
  if (!Array.isArray(entries)) throw new Error(`${label} must be an array`);
  const seen = new Set<string>();
  let previous = '';
  for (const entry of entries) {
    if (!entry || typeof entry.version !== 'string' || !/^\d{14}$/.test(entry.version) ||
        typeof entry.name !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(entry.name) ||
        typeof entry.checksum !== 'string' || !/^[a-f0-9]{64}$/.test(entry.checksum)) {
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
  const selectedPending = pending.slice(0, selected.migrations.length);
  for (let index = 0; index < selectedPending.length; index += 1) {
    if (selected.migrations[index].checksum !== selectedPending[index].checksum) {
      throw new Error(
        `Production migration batch ${batchId} checksum mismatch for ${selectedPending[index].version}_${selectedPending[index].name}: reviewed=${selected.migrations[index].checksum}, repository=${selectedPending[index].checksum}`,
      );
    }
  }
  assertProductionMigrationBatchCutoverDependencies(selectedPending, appliedVersions);
  return selectedPending;
};

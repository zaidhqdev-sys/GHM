export type MigrationBatchEntry = { version: string; name: string };
export type MigrationBatch = { id: string; purpose: string; migrations: MigrationBatchEntry[] };
/** Select a reviewed production batch: an exact contiguous prefix of pending migrations. */
export const selectProductionMigrationBatch = (migrations: MigrationBatchEntry[], appliedVersions: ReadonlySet<string>, batches: MigrationBatch[], batchId: string | undefined): MigrationBatchEntry[] => {
  if (!batchId?.trim()) throw new Error('Production migration refused: GHM_MIGRATION_BATCH_ID must identify a committed, reviewed execution batch');
  const ids = new Set<string>();
  for (const batch of batches) {
    if (!batch.id.trim() || ids.has(batch.id)) throw new Error('Production migration batch manifest contains an empty or duplicate batch ID');
    ids.add(batch.id);
    if (!batch.purpose.trim() || batch.migrations.length === 0) throw new Error(`Production migration batch ${batch.id} must have a purpose and at least one migration`);
  }
  const selected = batches.find(batch => batch.id === batchId);
  if (!selected) throw new Error(`Production migration refused: unknown execution batch ${batchId}`);
  const pending = migrations.filter(migration => !appliedVersions.has(migration.version));
  const seen = new Set<string>();
  for (const [index, entry] of selected.migrations.entries()) {
    if (seen.has(entry.version)) throw new Error(`Production migration batch ${batchId} contains duplicate version ${entry.version}`);
    seen.add(entry.version);
    const actual = migrations.find(migration => migration.version === entry.version);
    if (!actual || actual.name !== entry.name) throw new Error(`Production migration batch ${batchId} does not match repository migration ${entry.version}_${entry.name}`);
    if (appliedVersions.has(entry.version)) throw new Error(`Production migration batch ${batchId} includes already-applied migration ${entry.version}`);
    if (pending[index]?.version !== entry.version || pending[index]?.name !== entry.name) throw new Error(`Production migration batch ${batchId} is not an exact contiguous prefix of pending migrations; refused at ${entry.version}_${entry.name}`);
  }
  return selected.migrations;
}

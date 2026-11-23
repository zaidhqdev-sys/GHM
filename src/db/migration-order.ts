export type MigrationVersion = { version: string; name: string };

export type OutOfOrderPendingMigration = {
  pending: MigrationVersion;
  laterApplied: MigrationVersion;
};

/**
 * A missing migration must never be replayed when a later repository
 * migration is already present in the ledger. Such a gap can reintroduce
 * superseded SQL (including legacy unsigned gateway overloads).
 */
export const findOutOfOrderPendingMigration = (
  migrations: MigrationVersion[],
  appliedVersions: ReadonlySet<string>,
): OutOfOrderPendingMigration | null => {
  for (let index = 0; index < migrations.length; index += 1) {
    const pending = migrations[index];
    if (appliedVersions.has(pending.version)) continue;
    const laterApplied = migrations.slice(index + 1).find((candidate) =>
      appliedVersions.has(candidate.version),
    );
    if (laterApplied) return { pending, laterApplied };
  }
  return null;
};


export type AppliedMigrationLedgerEntry = { version: string; name: string };

/**
 * Applied ledger rows must retain the repository migration name for their version.
 * Historical rows absent from the current repository are left to the retained-history audit.
 */
export const assertAppliedMigrationNames = (
  migrations: MigrationVersion[],
  appliedEntries: AppliedMigrationLedgerEntry[],
): void => {
  const migrationByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  for (const applied of appliedEntries) {
    const repositoryMigration = migrationByVersion.get(applied.version);
    if (repositoryMigration && repositoryMigration.name !== applied.name) {
      throw new Error(
        `Migration ledger name mismatch for ${applied.version}: database=${applied.name}, repository=${repositoryMigration.name}`,
      );
    }
  }
};

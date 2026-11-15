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

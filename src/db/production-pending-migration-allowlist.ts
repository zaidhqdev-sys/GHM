export type ProductionMigrationVersion = { version: string; name: string };

export const assertProductionPendingMigrationAllowlist = (
  migrations: ProductionMigrationVersion[],
  appliedVersions: ReadonlySet<string>,
  allowlist: ProductionMigrationVersion[],
): void => {
  const migrationByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
  const allowedByVersion = new Map<string, string>();

  for (const allowed of allowlist) {
    if (!/^\d{14}$/.test(allowed.version) || !allowed.name.trim()) {
      throw new Error('Production migration allowlist contains an invalid version/name entry');
    }
    if (allowedByVersion.has(allowed.version)) {
      throw new Error(`Production migration allowlist contains duplicate version ${allowed.version}`);
    }
    const repositoryMigration = migrationByVersion.get(allowed.version);
    if (!repositoryMigration || repositoryMigration.name !== allowed.name) {
      throw new Error(`Production migration allowlist entry does not match repository migration ${allowed.version}_${allowed.name}`);
    }
    allowedByVersion.set(allowed.version, allowed.name);
  }

  const unexpected = migrations.filter((migration) =>
    !appliedVersions.has(migration.version) &&
    allowedByVersion.get(migration.version) !== migration.name,
  );

  if (unexpected.length > 0) {
    const preview = unexpected.slice(0, 10)
      .map((migration) => `${migration.version}_${migration.name}`)
      .join(', ');
    const remainder = unexpected.length > 10 ? `, and ${unexpected.length - 10} more` : '';
    throw new Error(
      `Production migration allowlist mismatch: refusing to execute ${unexpected.length} unapproved pending migration(s): ${preview}${remainder}`,
    );
  }
};

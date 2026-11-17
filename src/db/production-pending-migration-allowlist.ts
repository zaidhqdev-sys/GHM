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

  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));
  const inventoryMatchesPending = pending.length === allowlist.length &&
    pending.every((migration, index) =>
      allowlist[index]?.version === migration.version &&
      allowlist[index]?.name === migration.name,
    );

  if (!inventoryMatchesPending) {
    const pendingVersions = new Set(pending.map((migration) => migration.version));
    const inventoryVersions = new Set(allowlist.map((migration) => migration.version));
    const missing = pending
      .filter((migration) => !inventoryVersions.has(migration.version))
      .slice(0, 5)
      .map((migration) => `${migration.version}_${migration.name}`);
    const stale = allowlist
      .filter((migration) => !pendingVersions.has(migration.version))
      .slice(0, 5)
      .map((migration) => `${migration.version}_${migration.name}`);
    const orderOrNameMismatch = pending.length === allowlist.length &&
      missing.length === 0 && stale.length === 0;
    const detail = [
      missing.length ? `missing pending: ${missing.join(', ')}` : '',
      stale.length ? `stale/already-applied: ${stale.join(', ')}` : '',
      orderOrNameMismatch ? 'entries are not in exact repository order/name' : '',
    ].filter(Boolean).join('; ');
    throw new Error(
      `Production migration inventory mismatch: expected exact pending queue (${pending.length}), found inventory (${allowlist.length}); ${detail || 'refresh the inventory from the current ledger'}`,
    );
  }
};

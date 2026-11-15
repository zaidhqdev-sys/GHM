import type { ProductionMigrationVersion } from './production-pending-migration-allowlist';

export const MAX_PRODUCTION_MIGRATION_BATCH_SIZE = 5;

export const parseProductionMigrationBatch = (raw: string | undefined): ProductionMigrationVersion[] => {
  if (!raw?.trim()) {
    throw new Error('Production migration refused: set GHM_PRODUCTION_MIGRATION_BATCH to an explicit JSON array of ordered {version,name} entries');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Production migration refused: GHM_PRODUCTION_MIGRATION_BATCH must be valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_PRODUCTION_MIGRATION_BATCH_SIZE) {
    throw new Error(`Production migration refused: batch must contain between 1 and ${MAX_PRODUCTION_MIGRATION_BATCH_SIZE} migrations`);
  }
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Production migration refused: invalid batch entry at index ${index}`);
    }
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.version !== 'string' || !/^\d{14}$/.test(candidate.version) ||
        typeof candidate.name !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(candidate.name)) {
      throw new Error(`Production migration refused: invalid version/name at batch index ${index}`);
    }
    return { version: candidate.version, name: candidate.name };
  });
};

export const selectProductionMigrationBatch = (
  migrations: ProductionMigrationVersion[],
  appliedVersions: ReadonlySet<string>,
  requestedBatch: ProductionMigrationVersion[],
): ProductionMigrationVersion[] => {
  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));
  if (requestedBatch.length === 0 || requestedBatch.length > MAX_PRODUCTION_MIGRATION_BATCH_SIZE) {
    throw new Error(`Production migration refused: batch size must be between 1 and ${MAX_PRODUCTION_MIGRATION_BATCH_SIZE}`);
  }
  const seen = new Set<string>();
  for (const entry of requestedBatch) {
    if (seen.has(entry.version)) throw new Error(`Production migration refused: duplicate batch version ${entry.version}`);
    seen.add(entry.version);
  }
  for (let index = 0; index < requestedBatch.length; index += 1) {
    const requested = requestedBatch[index];
    const expected = pending[index];
    if (!expected || requested.version !== expected.version || requested.name !== expected.name) {
      throw new Error(`Production migration refused: batch must exactly match the next pending prefix; expected ${expected ? expected.version + '_' + expected.name : 'no further pending migration'}, received ${requested.version}_${requested.name}`);
    }
  }
  return pending.slice(0, requestedBatch.length);
};

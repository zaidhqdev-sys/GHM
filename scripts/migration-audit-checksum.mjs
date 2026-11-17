import crypto from 'node:crypto';

/**
 * node-postgres replaces an explicitly supplied ssl object when SSL options
 * are present in connectionString. Strip those URL options so the caller's
 * verified TLS policy (including rejectUnauthorized) remains authoritative.
 */
export const stripPostgresSslConnectionStringOptions = (connectionString) => {
  const url = new URL(connectionString);
  for (const key of [...url.searchParams.keys()]) {
    if (/^ssl/i.test(key) || key.toLowerCase() === 'uselibpqcompat') url.searchParams.delete(key);
  }
  return url.toString();
};

export const normalizeMigrationSqlForChecksum = (sql) => sql.replace(/\r\n?/g, '\n');

export const migrationChecksum = (sql) =>
  crypto.createHash('sha256').update(normalizeMigrationSqlForChecksum(sql), 'utf8').digest('hex');

export const legacyCrlfMigrationChecksum = (sql) =>
  crypto.createHash('sha256')
    .update(normalizeMigrationSqlForChecksum(sql).replace(/\n/g, '\r\n'), 'utf8')
    .digest('hex');

export const matchesSupportedMigrationChecksum = (storedChecksum, sql) =>
  storedChecksum === migrationChecksum(sql) ||
  storedChecksum === legacyCrlfMigrationChecksum(sql);

export const classifyRetainedHistoricalMigration = ({ version, registered, live, repository }) => {
  if (!live) return { version, status: 'ORPHANED', reason: 'missing_live_ledger_row' };
  if (repository) return { version, status: 'REPOSITORY_MIGRATION_PRESENT', reason: 'historical_entry_has_repository_migration' };
  if (!registered || live.name !== registered.name || live.checksum !== registered.checksum) {
    return { version, status: 'LEDGER_MISMATCH', reason: 'live_ledger_does_not_match_registered_history' };
  }
  return { version, status: 'VERIFIED_RETAINED_HISTORY', reason: 'ledger_name_and_checksum_match_registered_history' };
};

/**
 * Exception records preserve a historical applied-byte checksum. Their value
 * need not equal today's ledger checksum: current reconciliation is based on
 * canonical LF bytes or the explicitly supported legacy CRLF representation.
 */
export const classifyHistoricalException = ({ version, registeredChecksum, live, repository }) => {
  if (!live || !repository) {
    return { version, status: 'ORPHANED', reason: !live ? 'missing_live_ledger_row' : 'missing_repository_migration' };
  }
  if (registeredChecksum === repository.canonicalChecksum ||
      registeredChecksum === repository.legacyCrlfChecksum) {
    return { version, status: 'REDUNDANT', reason: 'registered_hash_matches_current_repository_bytes' };
  }
  return {
    version,
    status: 'HISTORICAL_PROVENANCE_RETAINED',
    reason: 'historical_hash_is_provenance_not_a_required_current_ledger_hash',
  };
};

const migrationAuditTargets = {
  production: {
    databases: ['ghm_db'],
    exceptionsPath: 'config/historical-migration-provenance-exceptions.production.json',
    retainedPath: 'config/retained-historical-migrations.production.json',
    pendingPath: 'config/pending-migrations.production.json',
  },
  qualification: {
    databases: ['ghm_payfast_qualification', 'ghm_disposable_test'],
    exceptionsPath: 'config/historical-migration-provenance-exceptions.qualification.json',
    retainedPath: 'config/retained-historical-migrations.qualification.json',
  },
};

export const resolveMigrationAuditTarget = (database, requestedTarget) => {
  const inferredTarget = database === 'ghm_db' ? 'production'
    : ['ghm_payfast_qualification', 'ghm_disposable_test'].includes(database) ? 'qualification' : null;
  const target = requestedTarget || inferredTarget;
  const config = migrationAuditTargets[target];
  if (!config) throw new Error('Unsupported migration audit target/database: target=' + (requestedTarget || 'auto') + ', database=' + database);
  if (!config.databases.includes(database)) throw new Error('Migration audit target ' + target + ' is not valid for database ' + database);
  return { target, ...config };
};


/**
 * Compare the exact ordered production pending migration identity set.
 * Duplicate versions, malformed entries, stale omissions, extras, and
 * version/name substitutions all fail closed.
 */
export const comparePendingMigrationInventory = (actual, expected) => {
  const validate = (entries, label) => {
    if (!Array.isArray(entries)) throw new Error(label + ' must be an array');
    const seen = new Set();
    for (const item of entries) {
      if (!item || typeof item.version !== 'string' || !/^\d{14}$/.test(item.version) ||
          typeof item.name !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(item.name)) {
        throw new Error(label + ' contains an invalid version/name entry');
      }
      if (seen.has(item.version)) throw new Error(label + ' contains duplicate version ' + item.version);
      seen.add(item.version);
    }
    return [...entries].map(({ version, name }) => ({ version, name }))
      .sort((a, b) => a.version.localeCompare(b.version));
  };
  const actualSorted = validate(actual, 'Actual pending migration set');
  const expectedSorted = validate(expected, 'Production pending migration inventory');
  const actualByVersion = new Map(actualSorted.map((item) => [item.version, item]));
  const expectedByVersion = new Map(expectedSorted.map((item) => [item.version, item]));
  const missingFromInventory = actualSorted.filter((item) => !expectedByVersion.has(item.version));
  const staleInventory = expectedSorted.filter((item) => !actualByVersion.has(item.version));
  const nameMismatches = actualSorted.filter((item) => expectedByVersion.has(item.version) &&
    expectedByVersion.get(item.version).name !== item.name).map((item) => ({
      version: item.version, actual_name: item.name, expected_name: expectedByVersion.get(item.version).name,
    }));
  return {
    matches: missingFromInventory.length === 0 && staleInventory.length === 0 && nameMismatches.length === 0,
    actual_count: actualSorted.length,
    expected_count: expectedSorted.length,
    missing_from_inventory: missingFromInventory,
    stale_inventory_entries: staleInventory,
    name_mismatches: nameMismatches,
  };
};

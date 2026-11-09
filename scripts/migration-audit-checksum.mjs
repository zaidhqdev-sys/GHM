import crypto from 'node:crypto';

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

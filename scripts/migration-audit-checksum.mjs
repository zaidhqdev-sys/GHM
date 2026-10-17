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

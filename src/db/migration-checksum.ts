import crypto from 'crypto';

export const normalizeMigrationSqlForChecksum = (sql: string): string =>
  sql.replace(/\r\n?/g, '\n');

export const migrationSqlChecksum = (sql: string): string =>
  crypto.createHash('sha256').update(normalizeMigrationSqlForChecksum(sql), 'utf8').digest('hex');

export const matchesMigrationSqlChecksum = (storedChecksum: string, sql: string): boolean => {
  const normalizedSql = normalizeMigrationSqlForChecksum(sql);
  const canonicalChecksum = migrationSqlChecksum(normalizedSql);
  if (storedChecksum === canonicalChecksum) return true;

  // Backward compatibility for ledgers written before checksum line endings were normalized.
  const legacyCrlfChecksum = crypto
    .createHash('sha256')
    .update(normalizedSql.replace(/\n/g, '\r\n'), 'utf8')
    .digest('hex');
  return storedChecksum === legacyCrlfChecksum;
};

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

/**
 * Prepare canonical migration SQL for the runner's already-open transaction.
 * Migration files may retain explicit outer BEGIN/COMMIT for standalone use;
 * strip only a leading BEGIN and trailing COMMIT when executing via this runner.
 * Checksum calculation always uses the untouched canonical SQL.
 */
export const normalizeMigrationSqlForExecution = (sql: string): string => {
  const withoutBom = sql.replace(/^\uFEFF/, '');
  return withoutBom
    .replace(/^\s*BEGIN\s*;\s*/i, '')
    .replace(/\s*COMMIT\s*;\s*$/i, '\n');
};


/**
 * node-postgres replaces an explicitly supplied ssl object when SSL options
 * are present in the connection URL. Remove URL-level SSL controls so the
 * migration runner's verified TLS policy remains authoritative.
 */
export const stripPostgresSslConnectionStringOptions = (connectionString: string): string => {
  const url = new URL(connectionString);
  for (const key of [...url.searchParams.keys()]) {
    if (/^ssl/i.test(key) || key.toLowerCase() === 'uselibpqcompat') url.searchParams.delete(key);
  }
  return url.toString();
};

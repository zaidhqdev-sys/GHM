import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { assertMatchingPostgresTargets, assertPostgresTargetConfiguration, normalizePostgresHost } from './postgres-target-guard';
import {
  migrationSqlChecksum,
  matchesMigrationSqlChecksum,
  normalizeMigrationSqlForChecksum,
} from './migration-checksum';

const sqlLf = 'SELECT 1;\nREVOKE SELECT ON TABLE ghm.example FROM ghm_runtime;\n';
const sqlCrlf = sqlLf.replace(/\n/g, '\r\n');

test('normalizes CRLF and LF before calculating migration checksums', () => {
  assert.equal(normalizeMigrationSqlForChecksum(sqlCrlf), sqlLf);
  assert.equal(migrationSqlChecksum(sqlLf), migrationSqlChecksum(sqlCrlf));
});

test('accepts legacy checksum recorded from CRLF migration bytes', () => {
  const legacyCrlfChecksum = crypto.createHash('sha256').update(sqlCrlf, 'utf8').digest('hex');
  assert.equal(matchesMigrationSqlChecksum(legacyCrlfChecksum, sqlLf), true);
  assert.equal(matchesMigrationSqlChecksum(migrationSqlChecksum(sqlLf), sqlCrlf), true);
});

test('rejects a checksum for genuinely different migration SQL', () => {
  const checksum = migrationSqlChecksum(sqlLf);
  assert.equal(matchesMigrationSqlChecksum(checksum, 'SELECT 2;\n'), false);
});


test('accepts the historical checksum of BOM-prefixed CRLF source bytes', () => {
  const sourceSql = '\uFEFFSELECT 1;\r\nREVOKE SELECT ON TABLE ghm.example FROM ghm_runtime;\r\n';
  const legacySourceChecksum = crypto.createHash('sha256').update(sourceSql, 'utf8').digest('hex');

  assert.notEqual(migrationSqlChecksum(sourceSql), migrationSqlChecksum(sourceSql.replace(/^\uFEFF/, '')));
  assert.equal(matchesMigrationSqlChecksum(legacySourceChecksum, sourceSql), true);
  assert.equal(matchesMigrationSqlChecksum(legacySourceChecksum, sourceSql.replace(/^\uFEFF/, '')), false);
});


test('requires explicit approved database name and PostgreSQL host', () => {
  assert.throws(
    () => assertPostgresTargetConfiguration('postgresql://ghm_runtime:redacted@dpg-123/ghm_db', {
      databaseName: undefined, host: 'dpg-123', label: 'test target',
    }),
    /explicit approved database name is required/,
  );
  assert.throws(
    () => assertPostgresTargetConfiguration('postgresql://ghm_runtime:redacted@dpg-123/ghm_db', {
      databaseName: 'ghm_db', host: undefined, label: 'test target',
    }),
    /explicit approved PostgreSQL host is required/,
  );
});

test('accepts only the explicitly approved host and database from a connection URL', () => {
  assert.deepEqual(
    assertPostgresTargetConfiguration('postgresql://ghm_runtime:redacted@dpg-123.frankfurt-postgres.render.com/ghm_db', {
      databaseName: 'ghm_db', host: 'dpg-123', label: 'test target',
    }),
    { databaseName: 'ghm_db', host: 'dpg-123.frankfurt-postgres.render.com' },
  );
  assert.throws(
    () => assertPostgresTargetConfiguration('postgresql://ghm_runtime:redacted@dpg-other/ghm_db', {
      databaseName: 'ghm_db', host: 'dpg-123', label: 'test target',
    }),
    /does not match the explicitly approved PostgreSQL host/,
  );
  assert.throws(
    () => assertPostgresTargetConfiguration('postgresql://ghm_runtime:redacted@dpg-123/other_db', {
      databaseName: 'ghm_db', host: 'dpg-123', label: 'test target',
    }),
    /does not match the explicitly approved database name/,
  );
});

test('normalizes Render host aliases and rejects different database targets', () => {
  assert.equal(normalizePostgresHost('dpg-123.frankfurt-postgres.render.com'), 'dpg-123');
  assert.doesNotThrow(() => assertMatchingPostgresTargets(
    { databaseName: 'ghm_db', host: 'dpg-123' },
    { databaseName: 'ghm_db', host: 'dpg-123.frankfurt-postgres.render.com' },
    'test target',
  ));
  assert.throws(() => assertMatchingPostgresTargets(
    { databaseName: 'ghm_db', host: 'dpg-123' },
    { databaseName: 'ghm_db', host: 'dpg-456' },
    'test target',
  ), /must target the same explicitly approved PostgreSQL database/);
});

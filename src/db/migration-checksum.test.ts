import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
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

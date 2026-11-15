import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  migrationSqlChecksum,
  matchesMigrationSqlChecksum,
  normalizeMigrationSqlForChecksum,
  normalizeMigrationSqlForExecution,
  stripPostgresSslConnectionStringOptions,
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

test('strips a leading UTF-8 BOM before executing SQL without changing checksum input', () => {
  const withBom = '\uFEFFSELECT 1;\n';
  assert.equal(normalizeMigrationSqlForExecution(withBom), 'SELECT 1;\n');
  assert.notEqual(migrationSqlChecksum(withBom), migrationSqlChecksum(normalizeMigrationSqlForExecution(withBom)));
});

test('strips only outer BEGIN and COMMIT for runner execution', () => {
  const wrapped = 'BEGIN;\nSELECT 1;\nCOMMIT;\n';
  assert.equal(normalizeMigrationSqlForExecution(wrapped), 'SELECT 1;\n');
  assert.equal(migrationSqlChecksum(wrapped), migrationSqlChecksum('BEGIN;\r\nSELECT 1;\r\nCOMMIT;\r\n'));
});

test('does not strip transaction keywords inside migration statements', () => {
  const sql = "SELECT 'BEGIN;';\nSELECT 'COMMIT;';\n";
  assert.equal(normalizeMigrationSqlForExecution(sql), sql);
});


test('strips URL SSL options so the explicit verified TLS policy cannot be overridden', () => {
  const input = 'postgresql://user:pass@db.example/ghm_db?sslmode=require&sslrootcert=%2Ftmp%2Fca.pem&sslcert=%2Ftmp%2Fclient.pem&sslkey=%2Ftmp%2Fclient.key&uselibpqcompat=true&application_name=ghm-migrator';
  const output = new URL(stripPostgresSslConnectionStringOptions(input));
  assert.equal(output.searchParams.has('sslmode'), false);
  assert.equal(output.searchParams.has('sslrootcert'), false);
  assert.equal(output.searchParams.has('sslcert'), false);
  assert.equal(output.searchParams.has('sslkey'), false);
  assert.equal(output.searchParams.has('uselibpqcompat'), false);
  assert.equal(output.searchParams.get('application_name'), 'ghm-migrator');
  assert.equal(output.hostname, 'db.example');
  assert.equal(output.pathname, '/ghm_db');
  assert.equal(output.username, 'user');
  assert.equal(output.password, 'pass');
});

test('preserves a clean PostgreSQL URL unchanged apart from URL canonicalization', () => {
  const output = new URL(stripPostgresSslConnectionStringOptions('postgresql://user:pass@db.example/ghm_db?application_name=ghm-migrator'));
  assert.equal(output.searchParams.get('application_name'), 'ghm-migrator');
});

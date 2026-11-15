import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { findOutOfOrderPendingMigration } from './migration-order';
import { assertProductionPendingMigrationAllowlist } from './production-pending-migration-allowlist';
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


test('detects a missing migration before a later applied migration', () => {
  const migrations = [
    { version: '20261110210000', name: 'legacy_gateway_guard' },
    { version: '20261110220000', name: 'legacy_identity_read' },
    { version: '20261111050000', name: 'signed_identity_gateway' },
  ];
  const result = findOutOfOrderPendingMigration(migrations, new Set(['20261111050000']));
  assert.deepEqual(result, {
    pending: migrations[0],
    laterApplied: migrations[2],
  });
});

test('allows a contiguous append-only pending migration suffix', () => {
  const migrations = [
    { version: '20261110210000', name: 'first' },
    { version: '20261110220000', name: 'second' },
    { version: '20261110230000', name: 'third' },
  ];
  assert.equal(findOutOfOrderPendingMigration(migrations, new Set(['20261110210000'])), null);
});

test('allows a fully applied migration history', () => {
  const migrations = [
    { version: '20261110210000', name: 'first' },
    { version: '20261110220000', name: 'second' },
  ];
  assert.equal(findOutOfOrderPendingMigration(migrations, new Set(migrations.map((item) => item.version))), null);
});


test('production migration allowlist permits only its configured pending suffix', () => {
  const migrations = [
    { version: '20261110100000', name: 'approved_first' },
    { version: '20261110120000', name: 'approved_second' },
    { version: '20261110140000', name: 'unapproved_third' },
  ];
  assert.throws(
    () => assertProductionPendingMigrationAllowlist(
      migrations,
      new Set(['20261110100000']),
      [
        { version: '20261110100000', name: 'approved_first' },
        { version: '20261110120000', name: 'approved_second' },
      ],
    ),
    /Production migration allowlist mismatch: refusing to execute 2 unapproved pending migration\(s\)/,
  );
});

test('production migration allowlist accepts a pending subset after earlier entries were applied', () => {
  const migrations = [
    { version: '20261110100000', name: 'approved_first' },
    { version: '20261110120000', name: 'approved_second' },
  ];
  assert.doesNotThrow(() => assertProductionPendingMigrationAllowlist(
    migrations,
    new Set(['20261110100000']),
    migrations,
  ));
});

test('production migration allowlist rejects stale or mismatched entries', () => {
  assert.throws(
    () => assertProductionPendingMigrationAllowlist(
      [{ version: '20261110100000', name: 'approved_first' }],
      new Set(),
      [{ version: '20261110100000', name: 'wrong_name' }],
    ),
    /does not match repository migration/,
  );
});

test('production migration allowlist rejects duplicate versions', () => {
  const migration = { version: '20261110100000', name: 'approved_first' };
  assert.throws(
    () => assertProductionPendingMigrationAllowlist(
      [migration],
      new Set(),
      [migration, migration],
    ),
    /contains duplicate version/,
  );
});

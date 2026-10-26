import test from 'node:test';
import assert from 'node:assert/strict';
import {
  migrationChecksum,
  legacyCrlfMigrationChecksum,
  matchesSupportedMigrationChecksum,
  classifyHistoricalException,
  classifyRetainedHistoricalMigration,
} from './migration-audit-checksum.mjs';

test('canonical checksum normalizes CRLF and CR to LF', () => {
  assert.equal(migrationChecksum('select 1;\r\nselect 2;\r'), migrationChecksum('select 1;\nselect 2;\n'));
});

test('supported legacy CRLF checksum is accepted without rewriting ledger data', () => {
  const sql = 'select 1;\nselect 2;\n';
  assert.notEqual(migrationChecksum(sql), legacyCrlfMigrationChecksum(sql));
  assert.equal(matchesSupportedMigrationChecksum(legacyCrlfMigrationChecksum(sql), sql), true);
});

test('genuine checksum mismatch does not pass supported line-ending policy', () => {
  assert.equal(matchesSupportedMigrationChecksum('a'.repeat(64), 'select 1;\n'), false);
});

test('historical exception is retained when live checksum differs but records still exist', () => {
  const result = classifyHistoricalException({
    version: '20260911030000',
    registeredChecksum: 'a'.repeat(64),
    live: { checksum: 'b'.repeat(64) },
    repository: { canonicalChecksum: 'c'.repeat(64), legacyCrlfChecksum: 'd'.repeat(64) },
  });
  assert.equal(result.status, 'HISTORICAL_PROVENANCE_RETAINED');
});

test('historical exception is orphaned only when its migration evidence is absent', () => {
  assert.equal(classifyHistoricalException({
    version: '20260911030000',
    registeredChecksum: 'a'.repeat(64),
    live: null,
    repository: { canonicalChecksum: 'c'.repeat(64), legacyCrlfChecksum: 'd'.repeat(64) },
  }).status, 'ORPHANED');
});

test('redundant exception is reported separately from an orphan', () => {
  assert.equal(classifyHistoricalException({
    version: '20260911030000',
    registeredChecksum: 'c'.repeat(64),
    live: { checksum: 'b'.repeat(64) },
    repository: { canonicalChecksum: 'c'.repeat(64), legacyCrlfChecksum: 'd'.repeat(64) },
  }).status, 'REDUNDANT');
});

test('retained historical migration passes only when live name and checksum match the manifest', () => {
  const registered = { name: 'historical_name', checksum: 'b'.repeat(64) };
  assert.equal(classifyRetainedHistoricalMigration({
    version: '20261016100000', registered,
    live: { name: registered.name, checksum: registered.checksum }, repository: null,
  }).status, 'VERIFIED_RETAINED_HISTORY');
  assert.equal(classifyRetainedHistoricalMigration({
    version: '20261016100000', registered,
    live: { name: registered.name, checksum: 'c'.repeat(64) }, repository: null,
  }).status, 'LEDGER_MISMATCH');
});

test('retained historical migration cannot hide a missing row or a repository migration', () => {
  const registered = { name: 'historical_name', checksum: 'b'.repeat(64) };
  assert.equal(classifyRetainedHistoricalMigration({
    version: '20261016100000', registered, live: null, repository: null,
  }).status, 'ORPHANED');
  assert.equal(classifyRetainedHistoricalMigration({
    version: '20261016100000', registered, live: { name: registered.name, checksum: registered.checksum },
    repository: { name: registered.name },
  }).status, 'REPOSITORY_MIGRATION_PRESENT');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  migrationChecksum,
  legacyCrlfMigrationChecksum,
  matchesSupportedMigrationChecksum,
  classifyHistoricalException,
  classifyRetainedHistoricalMigration,
  resolveMigrationAuditTarget,
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

test('PayFast applied migration checksums are registered as exact historical provenance', () => {
  const manifestPath = fileURLToPath(new URL('../config/historical-migration-provenance-exceptions.qualification.json', import.meta.url));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest['20261104120000'], 'da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff');
  assert.equal(manifest['20261104130000'], 'b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f');
});


test('production pending allowance is pinned to the reviewed pending migration set', () => {
  const pending = JSON.parse(readFileSync(new URL('../config/pending-migrations.production.json', import.meta.url), 'utf8'));
  assert.equal(pending.length, 1);
  assert.ok(pending.some((item) => item.version === '20261109210000' && item.name === 'deactivate_unrecognized_public_directory_records'));
});

test('production and qualification audit targets resolve to separate provenance manifests', () => {
  const production = resolveMigrationAuditTarget('ghm_db');
  const qualification = resolveMigrationAuditTarget('ghm_payfast_qualification');
  assert.equal(production.target, 'production');
  assert.equal(production.retainedPath, 'config/retained-historical-migrations.production.json');
  assert.equal(production.exceptionsPath, 'config/historical-migration-provenance-exceptions.production.json');
  assert.equal(production.pendingPath, 'config/pending-migrations.production.json');
  assert.equal(qualification.target, 'qualification');
  assert.equal(qualification.retainedPath, 'config/retained-historical-migrations.qualification.json');
  assert.equal(qualification.exceptionsPath, 'config/historical-migration-provenance-exceptions.qualification.json');
});

test('migration audit target selection rejects an explicit target/database mismatch', () => {
  assert.throws(() => resolveMigrationAuditTarget('ghm_db', 'qualification'), /not valid for database/);
  assert.throws(() => resolveMigrationAuditTarget('unknown_db'), /Unsupported migration audit target\/database/);
});

test('production and qualification retained history preserve distinct QuoteFlow bytes', () => {
  const production = JSON.parse(readFileSync(new URL('../config/retained-historical-migrations.production.json', import.meta.url), 'utf8'));
  const qualification = JSON.parse(readFileSync(new URL('../config/retained-historical-migrations.qualification.json', import.meta.url), 'utf8'));
  assert.equal(production['20261020130000'].checksum, 'a453171e85f6717476258c6d2d59a39b663be89826316036e6b9891cadfb13e9');
  assert.equal(qualification['20261020130000'].checksum, '3c09cc7ecb8f566f0d359832ad91cc7b644570220236713c02a0763a0521345b');
  assert.equal(production['20261031100000'], undefined);
  assert.ok(qualification['20261031100000']);
});

test('PayFast historical exceptions are qualification-only', () => {
  const production = JSON.parse(readFileSync(new URL('../config/historical-migration-provenance-exceptions.production.json', import.meta.url), 'utf8'));
  const qualification = JSON.parse(readFileSync(new URL('../config/historical-migration-provenance-exceptions.qualification.json', import.meta.url), 'utf8'));
  assert.equal(production['20261104120000'], undefined);
  assert.equal(production['20261104130000'], undefined);
  assert.ok(qualification['20261104120000']);
  assert.ok(qualification['20261104130000']);
});

test('production pending allowance is pinned to the reviewed pending migration set', () => {
  const pending = JSON.parse(readFileSync(new URL('../config/pending-migrations.production.json', import.meta.url), 'utf8'));
  assert.equal(pending.length, 1);
  assert.ok(pending.some((item) => item.version === '20261109210000' && item.name === 'deactivate_unrecognized_public_directory_records'));
});

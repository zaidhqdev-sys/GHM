import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Client } from 'pg';
import {
  classifyHistoricalException,
  classifyRetainedHistoricalMigration,
  migrationChecksum,
  legacyCrlfMigrationChecksum,
  stripPostgresSslConnectionStringOptions,
} from './migration-audit-checksum.mjs';

const databaseUrl = process.env.GHM_MIGRATION_AUDIT_DATABASE_URL?.trim();
const expectedDatabase = process.env.GHM_MIGRATION_AUDIT_DATABASE?.trim();
const expectedHost = process.env.GHM_MIGRATION_AUDIT_HOST?.trim();
const expectedRole = 'ghm_audit_login';
const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
const sha256Pattern = /^[a-f0-9]{64}$/;
const migrationPattern = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const fail = (message) => { throw new Error(message); };

const normalizeHost = (host) => host.trim().toLowerCase().replace(/\.frankfurt-postgres\.render\.com$/i, '');
if (!databaseUrl) fail('Missing GHM_MIGRATION_AUDIT_DATABASE_URL; use the dedicated read-only audit login, not the migrator URL.');
if (expectedDatabase !== 'ghm_db') fail('Production plan requires GHM_MIGRATION_AUDIT_DATABASE=ghm_db.');
if (!expectedHost) fail('Production plan requires explicit GHM_MIGRATION_AUDIT_HOST.');
if (process.env.DATABASE_SSL !== 'true') fail('Production plan requires DATABASE_SSL=true with certificate verification enabled.');

let parsedUrl;
try { parsedUrl = new URL(databaseUrl); } catch { fail('Production audit connection URL is invalid.'); }
if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) fail('Production audit connection must use PostgreSQL.');
if (decodeURIComponent(parsedUrl.pathname.replace(/^\//, '')) !== expectedDatabase) fail('Audit URL database does not match GHM_MIGRATION_AUDIT_DATABASE.');
if (normalizeHost(parsedUrl.hostname) !== normalizeHost(expectedHost)) fail('Audit URL host does not match GHM_MIGRATION_AUDIT_HOST.');

const client = new Client({
  connectionString: stripPostgresSslConnectionStringOptions(databaseUrl),
  ssl: { rejectUnauthorized: true },
});

const main = async () => {
  await client.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;
    const identityResult = await client.query(`
      SELECT current_user, session_user, current_database(),
             current_setting('transaction_read_only') AS transaction_read_only,
             current_setting('server_version_num') AS server_version_num
    `);
    const identity = identityResult.rows[0];
    if (!identity || identity.current_user !== expectedRole || identity.session_user !== expectedRole ||
        identity.current_database !== expectedDatabase || identity.transaction_read_only !== 'on') {
      fail('Read-only audit identity rejected: expected ghm_audit_login / ghm_db / transaction_read_only=on.');
    }

    const ledgerResult = await client.query(`
      SELECT version, name, checksum, applied_at
      FROM ghm.ghm_schema_migrations
      ORDER BY version
    `);
    const ledger = ledgerResult.rows;
    const productionExceptions = JSON.parse(await fs.readFile(
      path.resolve('config/historical-migration-provenance-exceptions.production.json'), 'utf8',
    ));
    const retainedRegistry = JSON.parse(await fs.readFile(
      path.resolve('config/retained-historical-migrations.production.json'), 'utf8',
    ));
    if (!productionExceptions || typeof productionExceptions !== 'object' || Array.isArray(productionExceptions) ||
        Object.entries(productionExceptions).some(([version, checksum]) =>
          !/^\d{14}$/.test(version) || typeof checksum !== 'string' || !sha256Pattern.test(checksum))) {
      fail('Production historical provenance exception manifest is invalid.');
    }
    if (!retainedRegistry || typeof retainedRegistry !== 'object' || Array.isArray(retainedRegistry)) {
      fail('Production retained-history registry is invalid.');
    }
    const sourceEntries = await fs.readdir(migrationsDir, { withFileTypes: true });
    const repository = [];
    for (const entry of sourceEntries) {
      if (!entry.isFile()) continue;
      const match = migrationPattern.exec(entry.name);
      if (!match) continue;
      const sql = await fs.readFile(path.join(migrationsDir, entry.name), 'utf8');
      repository.push({
        version: match[1], name: match[2], filename: entry.name,
        canonicalChecksum: migrationChecksum(sql),
        legacyCrlfChecksum: legacyCrlfMigrationChecksum(sql),
      });
    }
    repository.sort((a, b) => a.version.localeCompare(b.version));
    for (let i = 1; i < repository.length; i += 1) {
      if (repository[i - 1].version === repository[i].version) fail('Duplicate repository migration version: ' + repository[i].version);
    }

    const liveByVersion = new Map(ledger.map((row) => [row.version, row]));
    const repoByVersion = new Map(repository.map((row) => [row.version, row]));
    const canonicalMatches = [];
    const legacyMatches = [];
    const historicalMatches = [];
    const nameMismatches = [];
    const checksumMismatches = [];
    const pending = [];

    for (const migration of repository) {
      const live = liveByVersion.get(migration.version);
      if (!live) { pending.push({ version: migration.version, name: migration.name, checksum: migration.canonicalChecksum }); continue; }
      if (live.name !== migration.name) nameMismatches.push({ version: migration.version, repository: migration.name, ledger: live.name });
      if (live.checksum === migration.canonicalChecksum) canonicalMatches.push(migration.version);
      else if (live.checksum === migration.legacyCrlfChecksum) legacyMatches.push(migration.version);
      else {
        const registered = productionExceptions[migration.version];
        if (registered === live.checksum) historicalMatches.push(migration.version);
        else checksumMismatches.push({
          version: migration.version, name: migration.name, ledger: live.checksum,
          canonical: migration.canonicalChecksum, legacyCrlf: migration.legacyCrlfChecksum,
          registeredHistorical: registered ?? null,
        });
      }
    }

    const retainedAudit = Object.entries(retainedRegistry).map(([version, registered]) =>
      classifyRetainedHistoricalMigration({
        version, registered, live: liveByVersion.get(version), repository: repoByVersion.get(version),
      }),
    );
    const exceptionAudit = Object.entries(productionExceptions).map(([version, registeredChecksum]) =>
      classifyHistoricalException({
        version, registeredChecksum, live: liveByVersion.get(version), repository: repoByVersion.get(version),
      }),
    );
    const retainedFailures = retainedAudit.filter((row) => row.status !== 'VERIFIED_RETAINED_HISTORY');
    const exceptionOrphans = exceptionAudit.filter((row) => row.status === 'ORPHANED');
    const exceptionRedundant = exceptionAudit.filter((row) => row.status === 'REDUNDANT');
    const ledgerOnly = ledger.filter((row) => !repoByVersion.has(row.version));
    const unrecognizedLedgerOnly = ledgerOnly.filter((row) => {
      const registered = retainedRegistry[row.version];
      return !registered || registered.name !== row.name || registered.checksum !== row.checksum;
    });

    const pendingAllowlist = JSON.parse(await fs.readFile(path.resolve('config/pending-migrations.production.json'), 'utf8'));
    const pendingByVersion = new Map(pending.map((row) => [row.version, row.name]));
    const allowlistInvalid = pendingAllowlist.filter((row) => pendingByVersion.get(row.version) !== row.name);
    const allowlistOmitted = pending.filter((row) => !pendingAllowlist.some((allowed) =>
      allowed.version === row.version && allowed.name === row.name));
    const batchManifest = JSON.parse(await fs.readFile(path.resolve('config/production-migration-batches.json'), 'utf8'));
    if (!Array.isArray(batchManifest)) fail('Production migration batch manifest must be an array.');

    let batchSelection = { status: 'NO_AUTHORIZED_BATCH', reason: 'The committed production batch manifest is empty.' };
    const requestedBatchId = process.env.GHM_MIGRATION_BATCH_ID?.trim();
    if (batchManifest.length > 0 || requestedBatchId) {
      const require = createRequire(import.meta.url);
      const { selectProductionMigrationBatch } = require('../dist/db/migration-batches.js');
      try {
        const selected = selectProductionMigrationBatch(
          repository.map(({ version, name, canonicalChecksum }) => ({
            version, name, checksum: canonicalChecksum,
          })),
          new Set(ledger.map((row) => row.version)),
          batchManifest,
          requestedBatchId,
        );
        batchSelection = { status: 'SELECTED_FOR_REVIEW_ONLY', batch_id: requestedBatchId, migrations: selected };
      } catch (error) {
        batchSelection = { status: 'NOT_SELECTABLE', batch_id: requestedBatchId ?? null, reason: error instanceof Error ? error.message : String(error) };
      }
    }

    const checksumPass = checksumMismatches.length === 0 && nameMismatches.length === 0;
    const historyPass = retainedFailures.length === 0 && unrecognizedLedgerOnly.length === 0 && exceptionOrphans.length === 0;
    const allowlistPass = allowlistInvalid.length === 0 && allowlistOmitted.length === 0;
    const batchPass = batchSelection.status === 'SELECTED_FOR_REVIEW_ONLY';
    const report = {
      mode: 'READ_ONLY_PLAN_ONLY',
      execution_performed: false,
      sql_migrations_executed: 0,
      authority: {
        pass: true, current_user: identity.current_user, session_user: identity.session_user,
        database: identity.current_database, transaction_read_only: identity.transaction_read_only,
        server_version_num: identity.server_version_num, verified_tls: true,
      },
      source: { migration_count: repository.length },
      ledger: { row_count: ledger.length, current_source_applied_count: canonicalMatches.length + legacyMatches.length + historicalMatches.length,
        ledger_only_count: ledgerOnly.length },
      checksums: {
        canonical_match_count: canonicalMatches.length, legacy_crlf_match_count: legacyMatches.length,
        historical_exception_match_count: historicalMatches.length, mismatch_count: checksumMismatches.length,
        name_mismatch_count: nameMismatches.length, mismatches: checksumMismatches, name_mismatches: nameMismatches,
      },
      history: {
        retained_registry_count: Object.keys(retainedRegistry).length,
        retained_verified_count: retainedAudit.filter((row) => row.status === 'VERIFIED_RETAINED_HISTORY').length,
        retained_failures: retainedFailures, unrecognized_ledger_only: unrecognizedLedgerOnly,
        production_exception_count: Object.keys(productionExceptions).length,
        redundant_exceptions: exceptionRedundant, orphaned_exceptions: exceptionOrphans,
      },
      pending: {
        count: pending.length, migrations: pending,
        allowlist_count: pendingAllowlist.length, allowlist_pass: allowlistPass,
        allowlist_invalid: allowlistInvalid, omitted_from_allowlist_count: allowlistOmitted.length,
        omitted_from_allowlist: allowlistOmitted,
      },
      batch: batchSelection,
      release_gates: {
        checksum_reconciliation: checksumPass,
        retained_history_and_provenance: historyPass,
        pending_allowlist_complete: allowlistPass,
        reviewed_batch_selectable: batchPass,
        production_execution_authorized: false,
      },
      verdict: checksumPass && historyPass && allowlistPass && batchPass ? 'PLAN_VALID_NOT_AUTHORIZED' : 'PLAN_ONLY_NOT_EXECUTABLE',
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
  }
};
try { await main(); } finally { await client.end().catch(() => undefined); }

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import {
  classifyHistoricalException,
  classifyRetainedHistoricalMigration,
  migrationChecksum,
  legacyCrlfMigrationChecksum,
  resolveMigrationAuditTarget,
} from './migration-audit-checksum.mjs';

const databaseUrl = process.env.GHM_MIGRATOR_DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('Missing required environment variable: GHM_MIGRATOR_DATABASE_URL');

const expectedDatabase = process.env.GHM_MIGRATION_AUDIT_DATABASE?.trim() || 'ghm_db';
const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
const auditTarget = resolveMigrationAuditTarget(expectedDatabase, process.env.GHM_MIGRATION_AUDIT_TARGET?.trim() || undefined);
const exceptionsPath = path.resolve(process.cwd(), auditTarget.exceptionsPath);
const retainedPath = path.resolve(process.cwd(), auditTarget.retainedPath);
const allowPending = process.argv.includes('--allow-pending');
const migrationPattern = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
const fail = (message) => { throw new Error(message); };
if (allowPending && auditTarget.target !== 'production') fail('Pending-migration allowance is restricted to the explicitly audited production pre-deploy target');

const main = async () => {
  await client.connect();
  let transactionOpen = false;
  try {
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;
    const before = await client.query(`
      SELECT current_user, session_user, current_database(),
        pg_has_role('ghm_migrator', 'ghm_schema_owner', 'member') AS can_set_schema_owner
    `);
    const beforeIdentity = before.rows[0];
    if (!beforeIdentity) fail('No database identity row returned');
    await client.query('SET ROLE ghm_schema_owner');
    const after = await client.query('SELECT current_user, session_user, current_database()');
    const afterIdentity = after.rows[0];
    if (!afterIdentity) fail('No post-SET ROLE identity row returned');

    const authorityPass =
      beforeIdentity.current_user === 'ghm_migrator' &&
      beforeIdentity.session_user === 'ghm_migrator' &&
      beforeIdentity.current_database === expectedDatabase &&
      beforeIdentity.can_set_schema_owner === true &&
      afterIdentity.current_user === 'ghm_schema_owner' &&
      afterIdentity.session_user === 'ghm_migrator' &&
      afterIdentity.current_database === expectedDatabase;
    if (!authorityPass) {
      fail(`Migration authority failure (expected database ${expectedDatabase}): before=${JSON.stringify(beforeIdentity)}, after=${JSON.stringify(afterIdentity)}`);
    }

    const ledger = await client.query(`
      SELECT version, name, checksum, applied_at
      FROM ghm.ghm_schema_migrations
      ORDER BY version
    `);
    const exceptions = JSON.parse(await fs.readFile(exceptionsPath, 'utf8'));
    if (!exceptions || typeof exceptions !== 'object' || Array.isArray(exceptions)) fail('Historical provenance exceptions must be a JSON object');
    for (const [version, checksum] of Object.entries(exceptions)) {
      if (!/^\d{14}$/.test(version)) fail(`Invalid historical provenance exception version: ${version}`);
      if (typeof checksum !== 'string' || !sha256Pattern.test(checksum)) fail(`Invalid historical provenance exception checksum for ${version}`);
    }

    let pendingAllowlist = [];
    if (allowPending) {
      pendingAllowlist = JSON.parse(await fs.readFile(path.resolve(process.cwd(), auditTarget.pendingPath), 'utf8'));
      if (!Array.isArray(pendingAllowlist) || pendingAllowlist.some((item) =>
        !item || typeof item.version !== 'string' || !/^\d{14}$/.test(item.version) ||
        typeof item.name !== 'string' || !item.name
      )) fail('Production pending migration allowlist must be an array of version/name records');
    }

    const retained = JSON.parse(await fs.readFile(retainedPath, 'utf8'));
    if (!retained || typeof retained !== 'object' || Array.isArray(retained)) fail('Retained historical migrations must be a JSON object');
    for (const [version, entry] of Object.entries(retained)) {
      if (!/^\d{14}$/.test(version)) fail(`Invalid retained historical migration version: ${version}`);
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
          typeof entry.name !== 'string' || !entry.name ||
          typeof entry.checksum !== 'string' || !sha256Pattern.test(entry.checksum) ||
          typeof entry.source !== 'string' || !entry.source ||
          typeof entry.reason !== 'string' || !entry.reason) {
        fail(`Invalid retained historical migration record for ${version}`);
      }
    }

    const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
    const repository = [];
    for (const entry of entries) {
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
      if (repository[i - 1].version === repository[i].version) fail(`Duplicate repository migration version: ${repository[i].version}`);
    }

    const liveByVersion = new Map(ledger.rows.map((row) => [row.version, row]));
    const repoByVersion = new Map(repository.map((row) => [row.version, row]));
    const exactMatches = [];
    const legacyLineEndingMatches = [];
    const approvedHistoricalMatches = [];
    const nameMismatches = [];
    const unexplainedMismatches = [];
    const missing = [];
    const extra = [];
    const approvedRetainedHistorical = [];
    const unrecognizedExtra = [];

    for (const migration of repository) {
      const live = liveByVersion.get(migration.version);
      if (!live) { missing.push(migration); continue; }
      if (live.name !== migration.name) {
        nameMismatches.push({ version: migration.version, repository_name: migration.name, live_name: live.name });
      }
      if (live.checksum === migration.canonicalChecksum) { exactMatches.push(migration.version); continue; }
      if (live.checksum === migration.legacyCrlfChecksum) { legacyLineEndingMatches.push(migration.version); continue; }
      if (exceptions[migration.version] === live.checksum) {
        approvedHistoricalMatches.push({ version: migration.version, name: migration.name });
        continue;
      }
      unexplainedMismatches.push({
        version: migration.version, name: migration.name,
        repository_canonical_checksum: migration.canonicalChecksum,
        repository_legacy_crlf_checksum: migration.legacyCrlfChecksum,
        live_checksum: live.checksum,
        registered_historical_checksum: exceptions[migration.version] ?? null,
      });
    }

    for (const live of ledger.rows) {
      if (repoByVersion.has(live.version)) continue;
      extra.push(live);
      const historical = retained[live.version];
      if (historical && historical.name === live.name && historical.checksum === live.checksum) {
        approvedRetainedHistorical.push({ version: live.version, name: live.name, source: historical.source });
      } else {
        unrecognizedExtra.push({
          version: live.version, name: live.name, checksum: live.checksum,
          registered_historical_name: historical?.name ?? null,
          registered_historical_checksum: historical?.checksum ?? null,
        });
      }
    }

    const retainedAudit = Object.entries(retained).map(([version, entry]) =>
      classifyRetainedHistoricalMigration({
        version, registered: entry, live: liveByVersion.get(version), repository: repoByVersion.get(version),
      }),
    );
    const invalidRetained = retainedAudit.filter((item) => item.status !== 'VERIFIED_RETAINED_HISTORY');
    const exceptionAudit = Object.entries(exceptions).map(([version, registeredChecksum]) =>
      classifyHistoricalException({
        version, registeredChecksum, live: liveByVersion.get(version), repository: repoByVersion.get(version),
      }),
    );
    const orphanedExceptions = exceptionAudit.filter((item) => item.status === 'ORPHANED');
    const redundantExceptions = exceptionAudit.filter((item) => item.status === 'REDUNDANT');

    const actualPending = missing.map(({ version, name }) => ({ version, name })).sort((a, b) => a.version.localeCompare(b.version));
    const expectedPending = [...pendingAllowlist].sort((a, b) => a.version.localeCompare(b.version));
    const pendingAllowlistMatches = !allowPending
      ? missing.length === 0
      : JSON.stringify(actualPending) === JSON.stringify(expectedPending);

    const verdict =
      authorityPass && pendingAllowlistMatches && unrecognizedExtra.length === 0 &&
      unexplainedMismatches.length === 0 && nameMismatches.length === 0 &&
      orphanedExceptions.length === 0 && invalidRetained.length === 0;

    console.log(JSON.stringify({
      authority: {
        pass: authorityPass, expected_database: expectedDatabase, read_only_transaction: true,
        before: beforeIdentity, after: afterIdentity,
      },
      migrations: {
        target: auditTarget.target, pending_migrations_allowed: allowPending,
        pending_allowlist_match: pendingAllowlistMatches, expected_pending_migrations: expectedPending,
        repository_count: repository.length, live_ledger_count: ledger.rows.length,
        canonical_match_count: exactMatches.length,
        supported_legacy_crlf_match_count: legacyLineEndingMatches.length,
        approved_historical_match_count: approvedHistoricalMatches.length,
        missing_count: missing.length, unexplained_mismatch_count: unexplainedMismatches.length,
        name_mismatch_count: nameMismatches.length, extra_count: extra.length,
        approved_retained_historical_count: approvedRetainedHistorical.length,
        unrecognized_extra_count: unrecognizedExtra.length,
        orphaned_exception_count: orphanedExceptions.length,
        redundant_exception_count: redundantExceptions.length,
        invalid_retained_history_count: invalidRetained.length,
        approved_historical_matches: approvedHistoricalMatches, missing,
        unexplained_mismatches: unexplainedMismatches, name_mismatches: nameMismatches,
        extra, approved_retained_historical: approvedRetainedHistorical,
        unrecognized_extra: unrecognizedExtra, pending_migrations: missing,
        pending_allowlist_mismatch_count: pendingAllowlistMatches ? 0 : 1, retained_history_audit: retainedAudit,
        historical_exception_audit: exceptionAudit,
      },
      verdict: verdict ? (missing.length && allowPending ? 'PASS_WITH_PENDING' : 'PASS') : 'INVESTIGATE',
    }, null, 2));
    if (!verdict) process.exitCode = 2;
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
  }
};
try { await main(); } finally { await client.end().catch(() => undefined); }

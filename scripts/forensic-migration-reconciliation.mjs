import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';

const databaseUrl = process.env.GHM_MIGRATOR_DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('Missing required environment variable: GHM_MIGRATOR_DATABASE_URL');
}

const migrationsDir = path.resolve(process.cwd(), 'database', 'migrations');
const exceptionsPath = path.resolve(process.cwd(), 'config', 'historical-migration-provenance-exceptions.json');
const migrationPattern = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

const client = new Client({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true'
    ? { rejectUnauthorized: false }
    : undefined,
});

const fail = (message) => {
  throw new Error(message);
};

const main = async () => {
  await client.connect();

  const before = await client.query(`
    SELECT
      current_user,
      session_user,
      current_database(),
      pg_has_role('ghm_migrator', 'ghm_schema_owner', 'member') AS can_set_schema_owner
  `);

  const beforeIdentity = before.rows[0];
  if (!beforeIdentity) fail('No database identity row returned');

  await client.query('SET ROLE ghm_schema_owner');

  const after = await client.query(`
    SELECT current_user, session_user, current_database()
  `);

  const afterIdentity = after.rows[0];
  if (!afterIdentity) fail('No post-SET ROLE identity row returned');

  const authorityPass =
    beforeIdentity.current_user === 'ghm_migrator' &&
    beforeIdentity.session_user === 'ghm_migrator' &&
    beforeIdentity.current_database === 'ghm_db' &&
    beforeIdentity.can_set_schema_owner &&
    afterIdentity.current_user === 'ghm_schema_owner' &&
    afterIdentity.session_user === 'ghm_migrator' &&
    afterIdentity.current_database === 'ghm_db';

  if (!authorityPass) {
    fail(
      `Migration authority failure: before=${JSON.stringify(beforeIdentity)}, after=${JSON.stringify(afterIdentity)}`,
    );
  }

  const ledger = await client.query(`
    SELECT version, name, checksum, applied_at
    FROM ghm.ghm_schema_migrations
    ORDER BY version
  `);

  const exceptionText = await fs.readFile(exceptionsPath, 'utf8');
  const exceptions = JSON.parse(exceptionText);
  if (!exceptions || typeof exceptions !== 'object' || Array.isArray(exceptions)) {
    fail('Historical provenance exceptions must be a JSON object');
  }
  for (const [version, checksum] of Object.entries(exceptions)) {
    if (!/^\d{14}$/.test(version)) fail(`Invalid historical provenance exception version: ${version}`);
    if (typeof checksum !== 'string' || !sha256Pattern.test(checksum)) {
      fail(`Invalid historical provenance exception checksum for ${version}`);
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
      version: match[1],
      name: match[2],
      filename: entry.name,
      checksum: crypto.createHash('sha256').update(sql, 'utf8').digest('hex'),
    });
  }

  repository.sort((a, b) => a.version.localeCompare(b.version));

  for (let i = 1; i < repository.length; i += 1) {
    if (repository[i - 1].version === repository[i].version) {
      fail(`Duplicate repository migration version: ${repository[i].version}`);
    }
  }

  const liveByVersion = new Map(ledger.rows.map((row) => [row.version, row]));
  const repoByVersion = new Map(repository.map((row) => [row.version, row]));

  const exactMatches = [];
  const approvedHistoricalMatches = [];
  const nameMismatches = [];
  const unexplainedMismatches = [];
  const missing = [];
  const extra = [];

  for (const migration of repository) {
    const live = liveByVersion.get(migration.version);

    if (!live) {
      missing.push(migration);
      continue;
    }

    if (live.name !== migration.name) {
      nameMismatches.push({
        version: migration.version,
        repository_name: migration.name,
        live_name: live.name,
      });
    }

    if (live.checksum === migration.checksum) {
      exactMatches.push(migration.version);
      continue;
    }

    const registeredException = exceptions[migration.version];
    if (registeredException === live.checksum) {
      approvedHistoricalMatches.push({
        version: migration.version,
        name: migration.name,
        repository_checksum: migration.checksum,
        live_checksum: live.checksum,
      });
      continue;
    }

    unexplainedMismatches.push({
      version: migration.version,
      name: migration.name,
      repository_checksum: migration.checksum,
      live_checksum: live.checksum,
      registered_exception_checksum: registeredException ?? null,
    });
  }

  for (const live of ledger.rows) {
    if (!repoByVersion.has(live.version)) {
      extra.push(live);
    }
  }

  const orphanedExceptions = Object.entries(exceptions)
    .filter(([version, checksum]) => {
      const live = liveByVersion.get(version);
      const repo = repoByVersion.get(version);
      return !live || !repo || live.checksum !== checksum || repo.checksum === checksum;
    })
    .map(([version, checksum]) => ({ version, checksum }));

  const verdict =
    authorityPass &&
    missing.length === 0 &&
    extra.length === 0 &&
    unexplainedMismatches.length === 0 &&
    nameMismatches.length === 0 &&
    orphanedExceptions.length === 0;

  console.log(JSON.stringify({
    authority: {
      pass: authorityPass,
      before: beforeIdentity,
      after: afterIdentity,
    },
    migrations: {
      repository_count: repository.length,
      live_ledger_count: ledger.rows.length,
      exact_match_count: exactMatches.length,
      approved_historical_match_count: approvedHistoricalMatches.length,
      missing_count: missing.length,
      unexplained_mismatch_count: unexplainedMismatches.length,
      name_mismatch_count: nameMismatches.length,
      extra_count: extra.length,
      orphaned_exception_count: orphanedExceptions.length,
      approved_historical_matches: approvedHistoricalMatches,
      missing,
      unexplained_mismatches: unexplainedMismatches,
      name_mismatches: nameMismatches,
      extra,
      orphaned_exceptions: orphanedExceptions,
    },
    verdict: verdict ? 'PASS' : 'INVESTIGATE',
  }, null, 2));

  if (!verdict) {
    process.exitCode = 2;
  }
};

try {
  await main();
} finally {
  await client.end().catch(() => undefined);
}

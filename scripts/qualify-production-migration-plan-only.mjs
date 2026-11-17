import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { migrationSqlChecksum } from '../dist/db/migration-checksum.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.NODE_ENV === 'production') throw new Error('Migration plan qualification is forbidden in production');
if (process.env.GHM_QUALIFICATION_DATABASE_NAME !== 'ghm_disposable_test') {
  throw new Error('Migration plan qualification requires the CI disposable qualification context');
}

const adminUrl = 'postgres://postgres:postgres@localhost:5432/postgres';
const targetUrl = 'postgres://postgres:postgres@localhost:5432/ghm_db';
const migratorUrl = 'postgres://ghm_migrator:migrator-test-password@localhost:5432/ghm_db';
const admin = new Pool({ connectionString: adminUrl, ssl: false, max: 1 });
let target;
try {
  await admin.query('CREATE DATABASE ghm_db');
  target = new Pool({ connectionString: targetUrl, ssl: false, max: 1 });

  await admin.query('GRANT CONNECT ON DATABASE ghm_db TO ghm_migrator');
  await admin.query('GRANT CREATE ON DATABASE ghm_db TO ghm_schema_owner');
  await target.query('CREATE SCHEMA ghm AUTHORIZATION ghm_schema_owner');
  await target.query('SET ROLE ghm_schema_owner');
  await target.query(`
    CREATE TABLE ghm.ghm_schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await target.query('RESET ROLE');

  const migrationDir = path.join(root, 'database', 'migrations');
  const entries = (await fs.promises.readdir(migrationDir))
    .filter(name => /^\d{14}_[a-z0-9][a-z0-9_-]*\.sql$/.test(name))
    .sort();
  const migrations = [];
  for (const filename of entries) {
    const match = /^(\d{14})_([a-z0-9][a-z0-9_-]*)\.sql$/.exec(filename);
    const sql = await fs.promises.readFile(path.join(migrationDir, filename), 'utf8');
    migrations.push({ version: match[1], name: match[2], checksum: migrationSqlChecksum(sql) });
  }

  const pendingInventory = JSON.parse(await fs.promises.readFile(
    path.join(root, 'config', 'pending-migrations.production.json'), 'utf8'
  ));
  assert.equal(migrations.length - pendingInventory.length, 105,
    'qualification fixture is anchored to the documented 105-row production ledger snapshot and the committed 50-entry pending inventory');
  const seeded = migrations.slice(0, 105);
  for (const migration of seeded) {
    await target.query(
      'INSERT INTO ghm.ghm_schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
      [migration.version, migration.name, migration.checksum],
    );
  }

  const before = await target.query(`
    SELECT
      (SELECT count(*)::int FROM ghm.ghm_schema_migrations) AS ledger_rows,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'ghm' AND c.relkind IN ('r','p','v','m','f','S')) AS ghm_objects
  `);
  assert.equal(before.rows[0].ledger_rows, 42);

  const result = spawnSync(process.execPath, [path.join(root, 'dist', 'db', 'migrate.js')], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GHM_MIGRATOR_DATABASE_URL: migratorUrl,
      GHM_MIGRATION_DATABASE_NAME: 'ghm_db',
      GHM_MIGRATION_DATABASE_HOST: 'localhost',
      GHM_MIGRATION_PLAN_ONLY: 'true',
      GHM_MIGRATION_PLAN_QUALIFICATION: 'true',
      GHM_MIGRATION_BATCH_ID: '',
      DATABASE_SSL: 'false',
    },
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error('Production migration plan-only qualification command failed');
  }

  const output = result.stdout || '';
  assert.match(output, /Production migration plan \(no SQL executed\):/);
  const plannedLines = output.split(/\r?\n/).filter(line => /SHA-256 [a-f0-9]{64}$/.test(line.trim()));
  assert.equal(plannedLines.length, pendingInventory.length,
    'plan-only output must enumerate every exact pending migration with its SHA-256 checksum');
  for (const migration of pendingInventory) {
    assert.ok(output.includes(migration.version + '_' + migration.name),
      'plan-only output omitted ' + migration.version + '_' + migration.name);
  }

  const after = await target.query(`
    SELECT
      (SELECT count(*)::int FROM ghm.ghm_schema_migrations) AS ledger_rows,
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'ghm' AND c.relkind IN ('r','p','v','m','f','S')) AS ghm_objects
  `);
  assert.deepEqual(after.rows[0], before.rows[0],
    'plan-only must leave both migration ledger and GHM catalog unchanged');
  console.log(JSON.stringify({
    qualificationTarget: 'local disposable database ghm_db only',
    appliedFixtureMigrations: seeded.length,
    plannedPendingMigrations: plannedLines.length,
    checksumsPrinted: true,
    ledgerAndCatalogUnchanged: true,
    batchIdRequired: false,
    sqlExecuted: false,
  }));
} finally {
  await target?.end();
  await admin.query('DROP DATABASE IF EXISTS ghm_db WITH (FORCE)').catch(() => undefined);
  await admin.end();
}

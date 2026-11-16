import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const root = process.cwd();
const dist = path.join(root, 'dist');
const adminUrl = process.env.GHM_BATCH_QUALIFICATION_ADMIN_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
const host = process.env.GHM_BATCH_QUALIFICATION_HOST || 'localhost';
const runId = String(process.pid) + '_' + String(Date.now());
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const databases = [];
const migrations = [
  { version: '20261117000100', name: 'fixture_first', sql: 'CREATE TABLE ghm.batch_fixture_first (id integer PRIMARY KEY);' },
  { version: '20261117000200', name: 'fixture_second', sql: 'CREATE TABLE ghm.batch_fixture_second (id integer PRIMARY KEY);' },
  { version: '20261117000300', name: 'fixture_third', sql: 'CREATE TABLE ghm.batch_fixture_third (id integer PRIMARY KEY);' },
];
const identities = migrations.map(({ version, name }) => ({ version, name }));
const batch = (id, selected) => ({ id, reason: 'Disposable PostgreSQL runner qualification fixture', migrations: selected.map(({ version, name }) => ({ version, name })) });
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const databaseUrl = (name) => adminUrl.replace(/\/[^/?]+(?=\?|$)/, '/' + name);

function workspace(label, inventory, batches, sqlMigrations = migrations) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghm-batch-' + label + '-'));
  fs.mkdirSync(path.join(dir, 'database', 'migrations'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true });
  fs.cpSync(dist, path.join(dir, 'dist'), { recursive: true });
  fs.copyFileSync(path.join(root, 'config', 'historical-migration-provenance-exceptions.json'),
    path.join(dir, 'config', 'historical-migration-provenance-exceptions.json'));
  writeJson(path.join(dir, 'config', 'production-pending-migration-inventory.json'), inventory);
  writeJson(path.join(dir, 'config', 'production-migration-batches.json'), { batches });
  for (const migration of sqlMigrations) {
    fs.writeFileSync(path.join(dir, 'database', 'migrations', migration.version + '_' + migration.name + '.sql'), migration.sql);
  }
  return dir;
}

async function createDatabase(label) {
  const name = ('ghm_batch_' + runId + '_' + label).replace(/[^a-z0-9_]/gi, '_').slice(0, 62);
  await admin.query('CREATE DATABASE "' + name + '"');
  databases.push(name);
  await admin.query('GRANT CONNECT ON DATABASE "' + name + '" TO ghm_migrator');
  await admin.query('GRANT CREATE ON DATABASE "' + name + '" TO ghm_schema_owner');
  const pool = new pg.Pool({ connectionString: databaseUrl(name), max: 1 });
  try {
    await pool.query('CREATE SCHEMA ghm AUTHORIZATION ghm_schema_owner');
    await pool.query('SET ROLE ghm_schema_owner');
    await pool.query('CREATE TABLE ghm.ghm_schema_migrations (version varchar(14) PRIMARY KEY, name text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await pool.query('RESET ROLE');
  } finally { await pool.end(); }
  return name;
}

function run(dir, database, extra = {}) {
  const url = databaseUrl(database).replace(/^postgres:\/\/postgres:[^@]+@/, 'postgres://ghm_migrator:migrator-test-password@');
  const result = spawnSync(process.execPath, [path.join(dir, 'dist', 'db', 'migrate.js')], {
    cwd: dir, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, NODE_ENV: 'test', GHM_MIGRATION_BATCH_QUALIFICATION: 'true',
      GHM_MIGRATOR_DATABASE_URL: url, GHM_MIGRATION_DATABASE_NAME: database,
      GHM_MIGRATION_DATABASE_HOST: host, DATABASE_SSL: 'false', ...extra },
  });
  if (result.error) throw result.error;
  return result;
}

async function queryDb(database, sql, params = []) {
  const pool = new pg.Pool({ connectionString: databaseUrl(database), max: 1 });
  try { return await pool.query(sql, params); } finally { await pool.end(); }
}
async function rows(database) {
  return (await queryDb(database, 'SELECT version, name, checksum FROM ghm.ghm_schema_migrations ORDER BY version')).rows;
}
async function exists(database, name) {
  return (await queryDb(database, 'SELECT to_regclass($1) IS NOT NULL AS found', ['ghm.' + name])).rows[0].found;
}
function refusal(result, pattern, label) {
  assert.notEqual(result.status, 0, label + ': runner unexpectedly succeeded\n' + result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, pattern, label + ': refusal reason missing');
}
async function scenario(label, inventory, batches, extra = {}) {
  const dir = workspace(label, inventory, batches);
  const database = await createDatabase(label);
  return { dir, database, result: run(dir, database, extra) };
}

try {
  assert.ok(fs.existsSync(dist), 'Run npm run build before qualification');
  assert.equal(process.env.NODE_ENV, 'test', 'NODE_ENV=test is required');
  assert.ok(host === 'localhost' || host === '127.0.0.1', 'Only localhost PostgreSQL is permitted');

  const plan = await scenario('plan', identities, [batch('plan-prefix', migrations.slice(0, 2))],
    { GHM_MIGRATION_BATCH_ID: 'plan-prefix', GHM_MIGRATION_PLAN_ONLY: 'true' });
  assert.equal(plan.result.status, 0, plan.result.stdout + plan.result.stderr);
  assert.match(plan.result.stdout, /Production migration plan \(no SQL executed\)/);
  assert.equal((await rows(plan.database)).length, 0);
  assert.equal(await exists(plan.database, 'batch_fixture_first'), false);
  console.log('PLAN-ONLY ROLLBACK / NO LEDGER WRITES: PASS');

  const noBatch = await scenario('no_batch', identities, []);
  refusal(noBatch.result, /requires GHM_MIGRATION_BATCH_ID/, 'empty manifest');
  assert.equal((await rows(noBatch.database)).length, 0);
  console.log('EMPTY MANIFEST / MISSING BATCH REFUSAL: PASS');

  const stale = await scenario('stale', identities.slice(0, 2), [batch('stale-prefix', migrations.slice(0, 1))],
    { GHM_MIGRATION_BATCH_ID: 'stale-prefix' });
  refusal(stale.result, /pending inventory mismatch/, 'stale inventory');
  console.log('STALE INVENTORY REFUSAL: PASS');

  const skipped = await scenario('skipped', identities, [batch('skip-prefix', migrations.slice(1, 2))],
    { GHM_MIGRATION_BATCH_ID: 'skip-prefix' });
  refusal(skipped.result, /not an exact contiguous prefix/, 'skipped prefix');
  console.log('SKIPPED PREFIX REFUSAL: PASS');

  const success = await scenario('success', identities, [batch('first-two', migrations.slice(0, 2))],
    { GHM_MIGRATION_BATCH_ID: 'first-two' });
  assert.equal(success.result.status, 0, success.result.stdout + success.result.stderr);
  assert.deepEqual((await rows(success.database)).map((row) => row.version), migrations.slice(0, 2).map((m) => m.version));
  assert.equal(await exists(success.database, 'batch_fixture_first'), true);
  assert.equal(await exists(success.database, 'batch_fixture_second'), true);
  assert.equal(await exists(success.database, 'batch_fixture_third'), false);
  console.log('EXPLICIT CONTIGUOUS BATCH EXECUTION: PASS');

  const failingMigrations = migrations.map((m, i) => i === 1
    ? { ...m, sql: 'CREATE TABLE ghm.batch_fixture_second (id integer PRIMARY KEY); SELECT 1 / 0;' }
    : m);
  const failureDir = workspace('failure', identities, [batch('failure-prefix', failingMigrations.slice(0, 2))], failingMigrations);
  const failureDb = await createDatabase('failure');
  const failure = run(failureDir, failureDb, { GHM_MIGRATION_BATCH_ID: 'failure-prefix' });
  refusal(failure, /division by zero/, 'injected migration failure');
  assert.equal((await rows(failureDb)).length, 0);
  assert.equal(await exists(failureDb, 'batch_fixture_first'), false);
  assert.equal(await exists(failureDb, 'batch_fixture_second'), false);
  console.log('MIGRATION FAILURE ATOMIC ROLLBACK: PASS');

  const sequential = await scenario('sequential', identities, [batch('first-two', migrations.slice(0, 2))],
    { GHM_MIGRATION_BATCH_ID: 'first-two' });
  assert.equal(sequential.result.status, 0, sequential.result.stdout + sequential.result.stderr);
  const nextDir = workspace('next', identities.slice(2), [batch('last-one', migrations.slice(2))]);
  const next = run(nextDir, sequential.database, { GHM_MIGRATION_BATCH_ID: 'last-one' });
  assert.equal(next.status, 0, next.stdout + next.stderr);
  const finalDir = workspace('final', [], []);
  const repeated = run(finalDir, sequential.database);
  assert.equal(repeated.status, 0, repeated.stdout + repeated.stderr);
  assert.equal((await rows(sequential.database)).length, 3);
  console.log('SEQUENTIAL BATCHES / REPEAT-RUN NO-OP: PASS');
  console.log('PRODUCTION MIGRATION BATCH RUNNER DISPOSABLE POSTGRESQL QUALIFICATION: PASS');
} finally {
  for (const name of databases.reverse()) {
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [name]).catch(() => {});
    await admin.query('DROP DATABASE IF EXISTS "' + name + '"').catch(() => {});
  }
  await admin.end();
}

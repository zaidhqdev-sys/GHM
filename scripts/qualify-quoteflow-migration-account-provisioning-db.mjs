import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
assert(runtimeUrl, 'GHM_RUNTIME_DATABASE_URL is required');
assert(migratorUrl, 'GHM_MIGRATOR_DATABASE_URL is required');
assert.notEqual(runtimeUrl, migratorUrl, 'runtime and migrator URLs must be distinct');

const runtime = new Client({ connectionString: runtimeUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const migrator = new Client({ connectionString: migratorUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const runId = randomUUID();
const subjects = Array.from({ length: 3 }, (_, i) => `qualify-${runId}-${i}-${randomUUID()}`);
const created = [];

try {
  await runtime.connect();
  await migrator.connect();
  await migrator.query('set role ghm_schema_owner');

  const identity = await runtime.query('select current_database() database, current_user user_name');
  assert.equal(identity.rows[0].database, 'ghm_db');
  assert.equal(identity.rows[0].user_name, 'ghm_runtime');

  const privilege = await runtime.query(`
    select
      has_function_privilege(current_user, 'ghm.auth_provision_migration_account(text,text,text,text)', 'EXECUTE') can_execute,
      has_table_privilege(current_user, 'ghm.account_identity', 'INSERT') can_insert_identity,
      has_table_privilege(current_user, 'ghm.account_identity', 'UPDATE') can_update_identity,
      has_table_privilege(current_user, 'ghm.account_identity', 'DELETE') can_delete_identity,
      has_table_privilege(current_user, 'ghm.account_external_identity', 'INSERT') can_insert_mapping,
      has_table_privilege(current_user, 'ghm.account_external_identity', 'UPDATE') can_update_mapping,
      has_table_privilege(current_user, 'ghm.account_external_identity', 'DELETE') can_delete_mapping
  `);
  assert.deepEqual(privilege.rows[0], {
    can_execute: true,
    can_insert_identity: false, can_update_identity: false, can_delete_identity: false,
    can_insert_mapping: false, can_update_mapping: false, can_delete_mapping: false,
  });

  for (const sql of [
    'insert into ghm.account_identity (full_name, role, account_status, is_system_admin) values (\'qualifier\', \'customer\', \'active\', false)',
    'insert into ghm.account_external_identity (provider, subject, account_id) values (\'supabase\', \'qualifier\', 1)',
  ]) {
    await assert.rejects(runtime.query(sql), /permission denied|insufficient_privilege/i);
  }

  const preflight = await migrator.query('select count(*)::int as count from ghm.account_external_identity where provider=$1 and subject=$2', ['supabase', subjects[0]]);
  assert.equal(preflight.rows[0].count, 0, `qualification subject unexpectedly exists: ${subjects[0]}`);

  const runtimePreflight = await runtime.query(
    'select count(*)::int as count from ghm.account_external_identity where provider=$1 and subject=$2',
    ['supabase', subjects[0]],
  );
  assert.equal(runtimePreflight.rows[0].count, 0, `runtime sees unexpected existing mapping: ${subjects[0]}`);

  const functionDefinition = await migrator.query(
    'select pg_get_functiondef(\'ghm.auth_provision_migration_account(text,text,text,text)\'::regprocedure) as definition',
  );
  assert.match(functionDefinition.rows[0].definition, /INSERT INTO ghm\\.account_external_identity[\\s\\S]*outcome := \'created\'/i);
  assert.doesNotMatch(functionDefinition.rows[0].definition, /EXCEPTION\\s+WHEN\\s+unique_violation/i);

  const first = await runtime.query(
    'select * from ghm.auth_provision_migration_account($1,$2,$3,$4)',
    ['supabase', subjects[0], 'DB Qualification User', 'customer'],
  );
  if (first.rows[0].outcome !== 'created') {
    const observed = await runtime.query(
      'select provider, subject, account_id from ghm.account_external_identity where provider=$1 and subject=$2',
      ['supabase', subjects[0]],
    );
    throw new Error(`unexpected first outcome: ${JSON.stringify({ result: first.rows[0], observed: observed.rows[0] ?? null, subject: subjects[0], run_id: runId })}`);
  }
  const postFirst = await migrator.query(
    'select provider, subject, account_id from ghm.account_external_identity where provider=$1 and subject=$2',
    ['supabase', subjects[0]],
  );
  assert.deepEqual(postFirst.rows[0], { provider: 'supabase', subject: subjects[0], account_id: first.rows[0].account_id });
  created.push(first.rows[0].account_id);

  const retry = await runtime.query(
    'select * from ghm.auth_provision_migration_account($1,$2,$3,$4)',
    ['supabase', subjects[0], 'Different Name', 'customer'],
  );
  assert.deepEqual(retry.rows[0], first.rows[0]);

  await assert.rejects(
    runtime.query('select * from ghm.auth_provision_migration_account($1,$2,$3,$4)', ['not-supabase', subjects[1], null, 'customer']),
    /migration provider must be supabase/i,
  );

  const concurrent = await Promise.all(
    Array.from({ length: 4 }, () =>
      runtime.query(
        'select * from ghm.auth_provision_migration_account($1,$2,$3,$4)',
        ['supabase', subjects[1], 'Concurrent Qualification User', 'customer'],
      ),
    ),
  );
  const outcomes = concurrent.map(r => r.rows[0]);
  assert.equal(outcomes.filter(r => r.outcome === 'created').length, 1);
  assert.equal(outcomes.filter(r => r.outcome === 'already_provisioned').length, 3);
  assert.equal(new Set(outcomes.map(r => String(r.account_id))).size, 1);
  created.push(outcomes[0].account_id);

  await runtime.query('begin');
  const rolled = await runtime.query(
    'select * from ghm.auth_provision_migration_account($1,$2,$3,$4)',
    ['supabase', subjects[2], 'Rollback Qualification User', 'customer'],
  );
  assert.equal(rolled.rows[0].outcome, 'created');
  await runtime.query('rollback');

  await migrator.query('begin');
  await migrator.query('set local role ghm_schema_owner');
  const rollbackCheck = await migrator.query(
    'select (select count(*) from ghm.account_external_identity where provider=$1 and subject=$2) mapping_count, (select count(*) from ghm.account_identity where id=$3) account_count',
    ['supabase', subjects[2], rolled.rows[0].account_id],
  );
  await migrator.query('commit');
  assert.deepEqual(rollbackCheck.rows[0], { mapping_count: '0', account_count: '0' });

  const catalog = await migrator.query(`
    select
      has_table_privilege('ghm_runtime', 'ghm.account_identity', 'INSERT') runtime_insert_identity,
      has_table_privilege('ghm_runtime', 'ghm.account_external_identity', 'INSERT') runtime_insert_mapping,
      has_function_privilege('ghm_runtime', 'ghm.auth_provision_migration_account(text,text,text,text)', 'EXECUTE') runtime_execute
  `);
  assert.deepEqual(catalog.rows[0], { runtime_insert_identity: false, runtime_insert_mapping: false, runtime_execute: true });

  console.log('QuoteFlow migration account provisioning DB qualification: PASS');
  console.log(JSON.stringify({ run_id: runId, subjects }, null, 2));
  console.log(JSON.stringify({ created_accounts: created, concurrent_outcomes: outcomes.map(r => r.outcome), rollback: rollbackCheck.rows[0] }, null, 2));
} finally {
  if (created.length) {
    await migrator.query('begin').catch(() => {});
    await migrator.query('set local role ghm_schema_owner').catch(() => {});
    await migrator.query(
      'delete from ghm.account_external_identity where account_id = any($1::bigint[]); delete from ghm.account_identity where id = any($1::bigint[]);',
      [created],
    ).catch(() => {});
    await migrator.query('commit').catch(() => {});
  }
  await runtime.end().catch(() => {});
  await migrator.end().catch(() => {});
}
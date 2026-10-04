import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const databaseSsl = process.env.DATABASE_SSL === 'true';
assert(runtimeUrl && migratorUrl && runtimeUrl !== migratorUrl);

const clientOptions = (connectionString) => ({
  connectionString,
  ...(databaseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

const runtime = new Client(clientOptions(runtimeUrl));
const migrator = new Client(clientOptions(migratorUrl));
const runId = randomUUID();
const subject = `qualify-enrollment-${runId}`;
const email = `quoteflow-${runId}@example.test`;
let accountId = null;
let enrollmentId = null;

try {
  await runtime.connect();
  await migrator.connect();
  await migrator.query('set role ghm_schema_owner');

  const identity = await runtime.query('select current_user');
  assert.equal(identity.rows[0].current_user, 'ghm_runtime');

  const privilege = await runtime.query(`
    select
      has_function_privilege(current_user, 'ghm.auth_register_quoteflow_migration_reset_enrollment(bigint,text,text,text,text,text)', 'EXECUTE') can_register,
      has_function_privilege(current_user, 'ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)', 'EXECUTE') can_lookup,
      has_table_privilege(current_user, 'ghm.quoteflow_migration_reset_enrollment', 'INSERT') can_insert,
      has_table_privilege(current_user, 'ghm.quoteflow_migration_reset_enrollment', 'UPDATE') can_update,
      has_table_privilege(current_user, 'ghm.quoteflow_migration_reset_enrollment', 'DELETE') can_delete
  `);
  assert.deepEqual(privilege.rows[0], {
    can_register: true, can_lookup: true, can_insert: false, can_update: false, can_delete: false,
  });

  const provision = await runtime.query(
    'select * from ghm.auth_provision_migration_account($1,$2,$3,$4)',
    ['supabase', subject, 'QuoteFlow Enrollment Qualification', 'customer'],
  );
  assert.equal(provision.rows[0].outcome, 'created');
  accountId = Number(provision.rows[0].account_id);

  const register = await runtime.query(
    'select * from ghm.auth_register_quoteflow_migration_reset_enrollment($1,$2,$3,$4,$5,$6)',
    [accountId, 'supabase', subject, 'Owner@Example.com', email, `synthetic/${runId}`],
  );
  assert.equal(register.rows[0].outcome, 'created');
  enrollmentId = Number(register.rows[0].enrollment_id);

  const retry = await runtime.query(
    'select * from ghm.auth_register_quoteflow_migration_reset_enrollment($1,$2,$3,$4,$5,$6)',
    [accountId, 'supabase', subject, 'Owner@Example.com', email, `synthetic/${runId}`],
  );
  assert.equal(retry.rows[0].outcome, 'already_registered');
  assert.equal(Number(retry.rows[0].enrollment_id), enrollmentId);

  const lookup = await runtime.query(
    'select * from ghm.auth_lookup_quoteflow_migration_reset_enrollment($1)',
    [email],
  );
  assert.deepEqual(lookup.rows[0], { enrollment_id: enrollmentId, account_id: accountId });

  const unknown = await runtime.query(
    'select * from ghm.auth_lookup_quoteflow_migration_reset_enrollment($1)',
    ['unknown@example.test'],
  );
  assert.equal(unknown.rowCount, 0);

  await assert.rejects(
    runtime.query(
      'select * from ghm.auth_register_quoteflow_migration_reset_enrollment($1,$2,$3,$4,$5,$6)',
      [accountId, 'not-supabase', subject, 'Owner@Example.com', email, `synthetic/${runId}`],
    ),
    /migration provider must be supabase/i,
  );

  const genericRecovery = await migrator.query(
    `select pg_get_functiondef('ghm.auth_lookup_password_by_normalized_email(text)'::regprocedure) as definition`,
  );
  assert.match(genericRecovery.rows[0].definition, /account_password_credential/i);

  console.log('QuoteFlow migration reset-enrollment DB qualification: PASS');
  console.log(JSON.stringify({
    run_id: runId,
    checks: [
      'synthetic credentialless migration account',
      'dedicated enrollment registration',
      'exact retry idempotency',
      'exact email lookup',
      'unknown lookup returns no row',
      'provider boundary',
      'runtime DML remains sealed',
      'generic recovery remains credential-bearing',
    ],
  }, null, 2));
} finally {
  if (accountId !== null) {
    await migrator.query('begin').catch(() => {});
    await migrator.query('set local role ghm_schema_owner').catch(() => {});
    await migrator.query(
      'delete from ghm.quoteflow_migration_reset_enrollment where account_id=$1; delete from ghm.account_external_identity where account_id=$1; delete from ghm.account_identity where id=$1;',
      [accountId],
    ).catch(() => {});
    await migrator.query('commit').catch(() => {});
  }
  await runtime.end().catch(() => {});
  await migrator.end().catch(() => {});
}

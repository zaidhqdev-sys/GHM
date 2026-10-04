import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { Client, Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const pepperValue = process.env.GHM_AUTH_TOKEN_PEPPER;
assert(runtimeUrl, 'GHM_RUNTIME_DATABASE_URL is required');
assert(migratorUrl, 'GHM_MIGRATOR_DATABASE_URL is required');
assert(pepperValue && pepperValue.length >= 32, 'GHM_AUTH_TOKEN_PEPPER is required');
assert.notEqual(runtimeUrl, migratorUrl, 'runtime and migrator URLs must be distinct');

const runtime = new Pool({
  connectionString: runtimeUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
const migrator = new Client({
  connectionString: migratorUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const protectRecovery = (wire) =>
  createHmac('sha256', Buffer.from(pepperValue, 'utf8'))
    .update(Buffer.concat([Buffer.from('recovery:', 'utf8'), Buffer.from(wire, 'base64url')]))
    .digest();

const runId = randomUUID();
const subjects = [
  `quoteflow-reset-${runId}-success`,
  `quoteflow-reset-${runId}-rollback`,
  `quoteflow-reset-${runId}-expiry`,
];
const createdAccounts = [];

const provision = async (subject) => {
  const result = await runtime.query(
    'select * from ghm.auth_bootstrap_external_identity($1,$2,$3,$4)',
    ['supabase', subject, 'QuoteFlow Reset Qualification User', 'customer'],
  );
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].created, true);
  const accountId = Number(result.rows[0].account_id);
  createdAccounts.push(accountId);
  return accountId;
};

try {
  await migrator.connect();
  await migrator.query('set role ghm_schema_owner');

  const identity = await runtime.query('select current_database() database, current_user user_name');
  assert.equal(identity.rows[0].database, 'ghm_db');
  assert.equal(identity.rows[0].user_name, 'ghm_runtime');

  const privilege = await runtime.query(`
    select
      has_function_privilege(current_user, 'ghm.auth_redeem_recovery(bytea)', 'EXECUTE') can_redeem,
      has_function_privilege(current_user, 'ghm.auth_set_password(bigint,text,text,text,integer,integer,integer)', 'EXECUTE') can_set_password,
      has_function_privilege(current_user, 'ghm.auth_revoke_all_sessions_for_account(bigint,text)', 'EXECUTE') can_revoke,
      has_table_privilege(current_user, 'ghm.password_recovery_credential', 'SELECT') can_read_recovery,
      has_table_privilege(current_user, 'ghm.account_password_credential', 'SELECT') can_read_password
  `);
  assert.deepEqual(privilege.rows[0], {
    can_redeem: true,
    can_set_password: true,
    can_revoke: true,
    can_read_recovery: false,
    can_read_password: false,
  });

  const { PostgresAuthPersistence } = await import('../dist/auth/foundation/persistence.js');
  const { createPasswordResetService } = await import('../dist/auth/password-reset.js');
  const persistence = new PostgresAuthPersistence(runtime);
  const resetService = createPasswordResetService(persistence);

  const accountId = await provision(subjects[0]);
  const mappingBefore = await runtime.query(
    'select provider, subject, account_id from ghm.account_external_identity where provider=$1 and subject=$2',
    ['supabase', subjects[0]],
  );
  assert.equal(mappingBefore.rowCount, 1);

  const oldSession = await persistence.createSessionWithRefresh(accountId);
  const recovery = await persistence.issueRecovery(accountId, 30);
  await resetService.reset(
    recovery.recoveryTokenWire,
    'quoteflow-reset-success@example.test',
    'QuoteFlow-Reset-2026!',
  );

  const credential = await persistence.lookupPasswordByEmail('quoteflow-reset-success@example.test');
  assert(credential);
  assert.equal(credential.accountId, accountId);
  assert.equal(credential.passwordHash.startsWith('$argon2id$'), true);
  assert.equal(credential.argon2MemoryKib, 65536);
  assert.equal(credential.argon2TimeCost, 3);
  assert.equal(credential.argon2Parallelism, 1);

  const revokedSession = await persistence.validateSession(oldSession.session.id);
  assert.equal(revokedSession.isUsable, false);
  assert.equal(revokedSession.rejectReason, 'session_revoked');

  const mappingAfter = await runtime.query(
    'select provider, subject, account_id from ghm.account_external_identity where provider=$1 and subject=$2',
    ['supabase', subjects[0]],
  );
  assert.deepEqual(mappingAfter.rows[0], mappingBefore.rows[0]);

  await assert.rejects(
    resetService.reset(
      recovery.recoveryTokenWire,
      'quoteflow-reset-success@example.test',
      'QuoteFlow-Reset-2026-REUSE!',
    ),
    (error) => error instanceof Error && error.message === 'Recovery credential invalid',
  );

  const rollbackAccountId = await provision(subjects[1]);
  const rollbackRecovery = await persistence.issueRecovery(rollbackAccountId, 30);
  const rollbackClient = await runtime.connect();
  try {
    await rollbackClient.query('BEGIN');
    const redeemed = await rollbackClient.query(
      'select ghm.auth_redeem_recovery($1) account_id',
      [protectRecovery(rollbackRecovery.recoveryTokenWire)],
    );
    assert.equal(Number(redeemed.rows[0].account_id), rollbackAccountId);
    await rollbackClient.query(
      'select ghm.auth_set_password($1,$2,$3,$4,$5,$6,$7)',
      [
        rollbackAccountId,
        'rollback@example.test',
        'rollback@example.test',
        '$argon2id$v=19$m=65536,t=3,p=1$qualification$qualification',
        65536,
        3,
        1,
      ],
    );
    await assert.rejects(rollbackClient.query('select 1/0'));
    await rollbackClient.query('ROLLBACK');
  } finally {
    rollbackClient.release();
  }

  const rollbackState = await migrator.query(
    `select
       (select count(*) from ghm.password_recovery_credential where account_id=$1 and used_at is not null) used_count,
       (select count(*) from ghm.account_password_credential where account_id=$1) password_count`,
    [rollbackAccountId],
  );
  assert.deepEqual(rollbackState.rows[0], { used_count: '0', password_count: '0' });

  const expiryAccountId = await provision(subjects[2]);
  const expiryRecovery = await persistence.issueRecovery(expiryAccountId, 30);
  await migrator.query(
    'update ghm.password_recovery_credential set expires_at = now() - interval \'1 second\' where token_hash = $1',
    [protectRecovery(expiryRecovery.recoveryTokenWire)],
  );
  await assert.rejects(
    resetService.reset(
      expiryRecovery.recoveryTokenWire,
      'quoteflow-reset-expiry@example.test',
      'QuoteFlow-Expired-2026!',
    ),
    (error) => error instanceof Error && error.message === 'Recovery credential invalid',
  );

  const expiryPassword = await migrator.query(
    'select count(*)::int count from ghm.account_password_credential where account_id=$1',
    [expiryAccountId],
  );
  assert.equal(expiryPassword.rows[0].count, 0);

  console.log('QuoteFlow migration reset/re-enrollment DB qualification: PASS');
  console.log(JSON.stringify({
    run_id: runId,
    checks: [
      'synthetic credentialless migration account',
      'successful Argon2id password establishment',
      'existing session revocation',
      'legacy external identity unchanged',
      'recovery credential single-use',
      'transaction rollback',
      'expired recovery rejection',
      'runtime secret-table DML remains sealed',
    ],
  }, null, 2));
} finally {
  if (createdAccounts.length) {
    await migrator.query('begin').catch(() => {});
    await migrator.query('set local role ghm_schema_owner').catch(() => {});
    await migrator.query(
      'delete from ghm.account_identity where id = any($1::bigint[])',
      [createdAccounts],
    ).catch(() => {});
    await migrator.query('commit').catch(() => {});
  }
  await migrator.end().catch(() => {});
  await runtime.end().catch(() => {});
}

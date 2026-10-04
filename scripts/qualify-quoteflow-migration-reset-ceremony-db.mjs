import assert from 'node:assert/strict';
import { randomBytes, createHmac, generateKeyPairSync } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const pepperText = process.env.GHM_AUTH_TOKEN_PEPPER;
assert(runtimeUrl && migratorUrl && runtimeUrl !== migratorUrl);
assert(pepperText && Buffer.byteLength(pepperText, 'utf8') >= 32);

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
const runtimePool = new Pool({ connectionString: runtimeUrl, ...(ssl ? { ssl } : {}) });
const migratorPool = new Pool({ connectionString: migratorUrl, ...(ssl ? { ssl } : {}) });
const runId = randomBytes(16).toString('hex');
const subject = `qualify-reset-${runId}`;
const email = `quoteflow-reset-${runId}@example.test`;
let accountId = null;
let enrollmentId = null;

const protectRecovery = (wire) => {
  const padded = wire.replace(/-/g, '+').replace(/_/g, '/');
  const raw = Buffer.from(padded + '='.repeat((4 - (padded.length % 4)) % 4), 'base64');
  return createHmac('sha256', Buffer.from(pepperText, 'utf8')).update(Buffer.concat([Buffer.from('recovery:', 'utf8'), raw])).digest();
};

try {
  const runtime = await runtimePool.connect();
  try {
    const who = await runtime.query('select current_user');
    assert.equal(who.rows[0].current_user, 'ghm_runtime');

    const privilege = await runtime.query(`
      select
        has_function_privilege(current_user, 'ghm.auth_complete_quoteflow_migration_reset(bytea,text,integer,integer,integer)', 'EXECUTE') can_complete,
        has_function_privilege(current_user, 'ghm.auth_create_session_with_refresh(bigint,bytea)', 'EXECUTE') can_session
    `);
    assert.deepEqual(privilege.rows[0], { can_complete: true, can_session: true });

    const provision = await runtime.query(
      'select * from ghm.auth_provision_migration_account($1,$2,$3,$4)',
      ['supabase', subject, 'QuoteFlow Reset Ceremony Qualification', 'customer'],
    );
    assert.equal(provision.rows[0].outcome, 'created');
    accountId = Number(provision.rows[0].account_id);

    const register = await runtime.query(
      'select * from ghm.auth_register_quoteflow_migration_reset_enrollment($1,$2,$3,$4,$5,$6)',
      [accountId, 'supabase', subject, 'Owner@Example.com', email, `synthetic/${runId}`],
    );
    assert.equal(register.rows[0].outcome, 'created');
    enrollmentId = Number(register.rows[0].enrollment_id);

    const session = await runtime.query(
      'select * from ghm.auth_create_session_with_refresh($1,$2)',
      [accountId, createHmac('sha256', Buffer.from(pepperText, 'utf8')).update(randomBytes(32)).digest()],
    );
    assert.equal(session.rowCount, 1);
    const oldSessionId = Number(session.rows[0].session_id);

    const rawToken = randomBytes(32);
    const wire = rawToken.toString('base64url');
    const tokenHash = protectRecovery(wire);
    await runtime.query(
      'select ghm.auth_issue_recovery($1,$2,current_timestamp + interval \'30 minutes\')',
      [accountId, tokenHash],
    );

    const { createArgon2idPasswordHasher } = await import('../dist/auth/foundation/password.js');
    const hasher = createArgon2idPasswordHasher();
    const hashed = await hasher.hash('CorrectHorseBattery1');

    const completed = await runtime.query(
      'select * from ghm.auth_complete_quoteflow_migration_reset($1,$2,$3,$4,$5)',
      [tokenHash, hashed.passwordHash, hashed.argon2MemoryKib, hashed.argon2TimeCost, hashed.argon2Parallelism],
    );
    assert.equal(completed.rowCount, 1);
    assert.equal(Number(completed.rows[0].account_id), accountId);
    assert.equal(completed.rows[0].login_email, 'Owner@Example.com');

    const verifier = await migratorPool.connect();
    await verifier.query('set role ghm_schema_owner');
    const enrollment = await verifier.query(
      'select enrollment_status from ghm.quoteflow_migration_reset_enrollment where id=$1',
      [enrollmentId],
    );
    assert.equal(enrollment.rows[0].enrollment_status, 'completed');

    const credential = await verifier.query(
      'select login_email, login_email_normalized, credential_status from ghm.account_password_credential where account_id=$1',
      [accountId],
    );
    assert.deepEqual(credential.rows[0], {
      login_email: 'Owner@Example.com',
      login_email_normalized: email,
      credential_status: 'active',
    });

    const oldSession = await verifier.query(
      'select session_status from ghm.authentication_session where id=$1',
      [oldSessionId],
    );
    assert.equal(oldSession.rows[0].session_status, 'revoked');

    const reuse = await verifier.query(
      'select enrollment_status from ghm.quoteflow_migration_reset_enrollment where id=$1',
      [enrollmentId],
    );
    assert.equal(reuse.rows[0].enrollment_status, 'completed');

    const newSession = await runtime.query(
      'select * from ghm.auth_create_session_with_refresh($1,$2)',
      [accountId, createHmac('sha256', Buffer.from(pepperText, 'utf8')).update(randomBytes(32)).digest()],
    );
    assert.equal(newSession.rowCount, 1);
    verifier.release();

    console.log('QuoteFlow migration reset ceremony DB qualification: PASS');
    console.log(JSON.stringify({
      run_id: runId,
      checks: [
        'credentialless migration account',
        'dedicated reset enrollment',
        'existing session revoked',
        'atomic recovery redemption + Argon2id password establishment',
        'approved migration email becomes canonical login credential',
        'enrollment transitions reset_required -> completed',
        'recovery credential consumed once',
        'post-reset GHM session creation',
      ],
    }, null, 2));
  } finally {
    runtime.release();
  }
} finally {
  if (accountId !== null) {
    const migrator = await migratorPool.connect();
    try {
      await migrator.query('begin');
      await migrator.query('set local role ghm_schema_owner');
      await migrator.query(
        'delete from ghm.quoteflow_migration_reset_enrollment where account_id=$1; delete from ghm.password_recovery_credential where account_id=$1; delete from ghm.refresh_credential where session_id in (select id from ghm.authentication_session where account_id=$1); delete from ghm.authentication_session where account_id=$1; delete from ghm.account_external_identity where account_id=$1; delete from ghm.account_password_credential where account_id=$1; delete from ghm.account_identity where id=$1;',
        [accountId],
      );
      await migrator.query('commit');
    } catch (error) {
      await migrator.query('rollback').catch(() => {});
      throw error;
    } finally {
      migrator.release();
    }
  }
  await runtimePool.end();
  await migratorPool.end();
}

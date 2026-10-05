import assert from 'node:assert/strict';
import { Client } from 'pg';
import 'dotenv/config';

const url = process.env.GHM_MIGRATOR_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('GHM_MIGRATOR_DATABASE_URL or DATABASE_URL is required');

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
await client.query('SET ROLE ghm_schema_owner');

try {
  const metadata = await client.query(
    "SELECT p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner, has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_execute, pg_get_function_identity_arguments(p.oid) AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'ghm' AND p.proname = 'auth_bootstrap_founder_system_admin' AND p.pronargs = 1",
  );

  assert.equal(metadata.rowCount, 1);
  assert.equal(metadata.rows[0].security_definer, true);
  assert.equal(metadata.rows[0].owner, 'ghm_schema_owner');
  assert.equal(metadata.rows[0].runtime_execute, false);
  assert.equal(metadata.rows[0].signature, 'p_login_email text');

  const privilege = await client.query(
    "SELECT has_table_privilege('ghm_runtime', 'ghm.founder_system_admin_bootstrap_state', 'SELECT,INSERT,UPDATE,DELETE') AS runtime_table_write",
  );
  assert.equal(privilege.rows[0].runtime_table_write, false);

  await assert.rejects(
    () =>
      client.query(
        "SELECT * FROM ghm.auth_bootstrap_founder_system_admin('not-the-founder@example.com')",
      ),
    /designated founder email/i,
  );

  await client.query('BEGIN');

  try {
    const before = await client.query(`
      SELECT
        ai.id,
        ai.role,
        ai.account_status,
        ai.is_system_admin,
        pc.login_email,
        pc.login_email_normalized,
        pc.credential_status,
        pc.password_hash,
        pc.argon2_memory_kib,
        pc.argon2_time_cost,
        pc.argon2_parallelism
      FROM ghm.account_identity ai
      JOIN ghm.account_password_credential pc
        ON pc.account_id = ai.id
      WHERE pc.login_email_normalized = 'zaidhqdev@gmail.com'
    `);

    assert.equal(before.rowCount, 1);

    const beforeCredential = before.rows[0];
    const accountId = Number(beforeCredential.id);

    assert.equal(beforeCredential.role, 'business');
    assert.equal(beforeCredential.account_status, 'active');
    assert.equal(beforeCredential.is_system_admin, false);
    assert.equal(beforeCredential.login_email, 'zaidhqdev@gmail.com');
    assert.equal(beforeCredential.login_email_normalized, 'zaidhqdev@gmail.com');
    assert.equal(beforeCredential.credential_status, 'active');

    const promoted = await client.query(
      "SELECT * FROM ghm.auth_bootstrap_founder_system_admin('zaidhqdev@gmail.com')",
    );

    assert.equal(promoted.rowCount, 1);
    assert.equal(Number(promoted.rows[0].account_id), accountId);
    assert.equal(promoted.rows[0].login_email, 'zaidhqdev@gmail.com');

    const identity = await client.query(
      'SELECT id, role, account_status, is_system_admin FROM ghm.account_identity WHERE id = $1',
      [accountId],
    );

    assert.deepEqual(identity.rows[0], {
      id: accountId,
      role: 'business',
      account_status: 'active',
      is_system_admin: true,
    });

    const credential = await client.query(
      `SELECT
        account_id,
        login_email,
        login_email_normalized,
        credential_status,
        password_hash,
        argon2_memory_kib,
        argon2_time_cost,
        argon2_parallelism
       FROM ghm.account_password_credential
       WHERE account_id = $1`,
      [accountId],
    );

    assert.equal(credential.rowCount, 1);
    assert.equal(credential.rows[0].account_id, accountId);
    assert.equal(credential.rows[0].login_email, beforeCredential.login_email);
    assert.equal(credential.rows[0].login_email_normalized, beforeCredential.login_email_normalized);
    assert.equal(credential.rows[0].credential_status, beforeCredential.credential_status);
    assert.equal(credential.rows[0].password_hash, beforeCredential.password_hash);
    assert.equal(credential.rows[0].argon2_memory_kib, beforeCredential.argon2_memory_kib);
    assert.equal(credential.rows[0].argon2_time_cost, beforeCredential.argon2_time_cost);
    assert.equal(credential.rows[0].argon2_parallelism, beforeCredential.argon2_parallelism);

    const membership = await client.query(
      'SELECT 1 FROM ghm.business_membership WHERE account_id = $1',
      [accountId],
    );
    assert.equal(membership.rowCount, 0);

    const state = await client.query(
      'SELECT account_id, founder_login_email FROM ghm.founder_system_admin_bootstrap_state WHERE id = true',
    );

    assert.deepEqual(state.rows[0], {
      account_id: accountId,
      founder_login_email: 'zaidhqdev@gmail.com',
    });

    await assert.rejects(
      () =>
        client.query(
          "SELECT * FROM ghm.auth_bootstrap_founder_system_admin('zaidhqdev@gmail.com')",
        ),
      /already initialized/i,
    );
  } finally {
    await client.query('ROLLBACK');
  }

  console.log(
    JSON.stringify(
      {
        audit: 'GHM founder system-admin bootstrap qualification',
        status: 'PASS',
        mutation: false,
        checks: [
          'security_definer',
          'schema_owner_authority',
          'runtime_execute_denied',
          'runtime_bootstrap_state_table_write_denied',
          'founder_identity_restriction',
          'existing_canonical_account_promotion',
          'existing_password_credential_preserved',
          'existing_business_role_preserved',
          'system_admin_establishment',
          'no_business_membership_side_effect',
          'permanent_bootstrap_state',
          'repeat_bootstrap_rejection',
          'transaction_rollback',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}


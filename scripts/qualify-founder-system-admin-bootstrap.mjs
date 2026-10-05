import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { Client } from 'pg';
import 'dotenv/config';

const url = process.env.GHM_MIGRATOR_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('GHM_MIGRATOR_DATABASE_URL or DATABASE_URL is required');

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

const passwordHash = await argon2.hash('GHM-founder-bootstrap-qualification-only', {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
});

await client.connect();
await client.query('SET ROLE ghm_schema_owner');

try {
  const metadata = await client.query(
    "SELECT p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner, has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_execute, pg_get_function_identity_arguments(p.oid) AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'ghm' AND p.proname = 'auth_bootstrap_founder_system_admin' AND p.pronargs = 7",
  );

  assert.equal(metadata.rowCount, 1);
  assert.equal(metadata.rows[0].security_definer, true);
  assert.equal(metadata.rows[0].owner, 'ghm_schema_owner');
  assert.equal(metadata.rows[0].runtime_execute, false);
  assert.equal(metadata.rows[0].signature, 'p_full_name text, p_login_email text, p_login_email_normalized text, p_password_hash text, p_argon2_memory_kib integer, p_argon2_time_cost integer, p_argon2_parallelism integer');

  await client.query('BEGIN');
  try {
    await assert.rejects(
      () =>
        client.query(
          "SELECT * FROM ghm.auth_bootstrap_founder_system_admin($1, 'not-the-founder@example.com', 'not-the-founder@example.com', $2, 65536, 3, 1)",
          ['Qualification Founder', passwordHash],
        ),
      /designated founder email/i,
    );

    const created = await client.query(
      "SELECT * FROM ghm.auth_bootstrap_founder_system_admin($1, 'zaidhqdev@gmail.com', 'zaidhqdev@gmail.com', $2, 65536, 3, 1)",
      ['Qualification Founder', passwordHash],
    );

    assert.equal(created.rowCount, 1);
    const accountId = Number(created.rows[0].account_id);
    assert.ok(accountId > 0);
    assert.equal(created.rows[0].login_email, 'zaidhqdev@gmail.com');

    const identity = await client.query(
      'SELECT id, role, account_status, is_system_admin FROM ghm.account_identity WHERE id = $1',
      [accountId],
    );
    assert.deepEqual(identity.rows[0], {
      id: accountId,
      role: 'customer',
      account_status: 'active',
      is_system_admin: true,
    });

    const credential = await client.query(
      'SELECT account_id, login_email, login_email_normalized, credential_status FROM ghm.account_password_credential WHERE account_id = $1',
      [accountId],
    );
    assert.equal(credential.rowCount, 1);
    assert.equal(credential.rows[0].account_id, accountId);
    assert.equal(credential.rows[0].login_email, 'zaidhqdev@gmail.com');
    assert.equal(credential.rows[0].login_email_normalized, 'zaidhqdev@gmail.com');
    assert.equal(credential.rows[0].credential_status, 'active');

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

    await client.query(
      'UPDATE ghm.account_identity SET is_system_admin = false WHERE id = $1',
      [accountId],
    );

    await assert.rejects(
      () =>
        client.query(
          "SELECT * FROM ghm.auth_bootstrap_founder_system_admin($1, 'zaidhqdev@gmail.com', 'zaidhqdev@gmail.com', $2, 65536, 3, 1)",
          ['Qualification Founder', passwordHash],
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
          'founder_identity_restriction',
          'canonical_account_creation',
          'system_admin_establishment',
          'password_credential_creation',
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

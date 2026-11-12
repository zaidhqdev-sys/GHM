import assert from 'node:assert/strict';
import { Pool } from 'pg';

const connectionString = process.env.GHM_RUNTIME_DATABASE_URL?.trim();
const expectedDatabase = process.env.GHM_QUALIFICATION_DATABASE_NAME;
if (!connectionString || expectedDatabase !== 'ghm_disposable_test') {
  throw new Error('Pre-cutover qualification requires the guarded disposable GHM runtime database');
}
const target = new URL(connectionString);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/ghm_disposable_test') {
  throw new Error('Pre-cutover qualification may target only local ghm_disposable_test');
}

const pool = new Pool({
  connectionString,
  ssl: false,
  max: 1,
  connectionTimeoutMillis: 5_000,
});

const expectedRuntimeAuthFunctions = [
  'ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)',
  'ghm.auth_lookup_password_by_normalized_email(text)',
  'ghm.auth_set_password(bigint, text, text, text, integer, integer, integer)',
  'ghm.auth_rehash_password_if_unchanged(bigint, text, text, integer, integer, integer)',
  'ghm.auth_create_session_with_refresh(bigint, bytea)',
  'ghm.auth_validate_session(bigint)',
  'ghm.auth_rotate_refresh(bytea, bytea)',
  'ghm.auth_revoke_by_refresh_hash(bytea, text)',
  'ghm.auth_issue_recovery(bigint, bytea, timestamp with time zone)',
  'ghm.auth_redeem_recovery(bytea)',
  'ghm.auth_redeem_recovery_with_count(bytea)',
  'ghm.auth_reset_password_with_recovery(bytea, text, text, integer, integer, integer)',
  'ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)',
  'ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)',
  'ghm.auth_lookup_external_identity(text, text)',
  'ghm.auth_lookup_business_external_mapping(text, text)',
].map((signature) => signature.replaceAll(', ', ',')).sort();

try {
  const result = await pool.query(`
    WITH expected(signature) AS (
      SELECT unnest(ARRAY[
        'ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)',
        'ghm.auth_lookup_password_by_normalized_email(text)',
        'ghm.auth_set_password(bigint, text, text, text, integer, integer, integer)',
        'ghm.auth_rehash_password_if_unchanged(bigint, text, text, integer, integer, integer)',
        'ghm.auth_create_session_with_refresh(bigint, bytea)',
        'ghm.auth_validate_session(bigint)',
        'ghm.auth_rotate_refresh(bytea, bytea)',
        'ghm.auth_revoke_by_refresh_hash(bytea, text)',
        'ghm.auth_issue_recovery(bigint, bytea, timestamptz)',
        'ghm.auth_redeem_recovery(bytea)',
        'ghm.auth_redeem_recovery_with_count(bytea)',
        'ghm.auth_reset_password_with_recovery(bytea, text, text, integer, integer, integer)',
        'ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)',
        'ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)',
        'ghm.auth_lookup_external_identity(text, text)',
        'ghm.auth_lookup_business_external_mapping(text, text)'
      ]::text[])
    )
    SELECT
      ARRAY(
        SELECT p.oid::regprocedure::text
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'ghm'
           AND left(p.proname, 5) = 'auth_'
           AND has_function_privilege('ghm_runtime', p.oid, 'EXECUTE')
         ORDER BY 1
      ) AS actual_runtime_functions,
      ARRAY(
        SELECT signature::regprocedure::text FROM expected ORDER BY 1
      ) AS expected_runtime_functions,
      ARRAY(
        SELECT p.oid::regprocedure::text
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
         WHERE n.nspname = 'ghm'
           AND left(p.proname, 5) = 'auth_'
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee <> p.proowner
           AND acl.grantee <> 'ghm_runtime'::regrole
         ORDER BY 1
      ) AS unexpected_auth_function_grantees
  `);

  const row = result.rows[0];
  assert.deepEqual(
    row.actual_runtime_functions,
    expectedRuntimeAuthFunctions,
    'pre-issuer Resource API runtime must have exactly the documented 16-function authentication allow-list before cutover',
  );
  assert.deepEqual(
    row.unexpected_auth_function_grantees,
    [],
    'pre-cutover auth functions must not be directly executable by PUBLIC or any non-runtime application principal',
  );

  process.stdout.write(JSON.stringify({
    preIssuerRuntimeAuthFunctions: row.actual_runtime_functions.length,
    unexpectedAuthFunctionGrantees: 0,
    preCutoverRuntimeGrantContract: 'passed',
  }) + '\n');
} finally {
  await pool.end();
}

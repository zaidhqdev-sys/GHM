import assert from 'node:assert/strict';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { Pool } from 'pg';
import { createAccessJwtService } from '../dist/auth/foundation/access-jwt.js';
import { loadEs256Keys } from '../dist/auth/foundation/es256-keys.js';
import { PostgresAuthPersistence } from '../dist/auth/foundation/persistence.js';
import { createArgon2idPasswordHasher } from '../dist/auth/foundation/password.js';
import { createGhmAuthService } from '../dist/auth/ghm-auth-service.js';

const issuerUrl = process.env.GHM_AUTH_ISSUER_DATABASE_URL?.trim();
const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL?.trim();
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL?.trim();
const expectedDatabase = process.env.GHM_QUALIFICATION_DATABASE_NAME;
if (!issuerUrl || !runtimeUrl || !migratorUrl) throw new Error('Issuer, runtime and migrator qualification URLs are required');
if (expectedDatabase !== 'ghm_disposable_test') {
  throw new Error('Auth issuer cutover qualification is restricted to ghm_disposable_test');
}
for (const [label, value] of [['issuer', issuerUrl], ['runtime', runtimeUrl], ['migrator', migratorUrl]]) {
  const parsed = new URL(value);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/ghm_disposable_test') {
    throw new Error(`Auth issuer qualification ${label} URL must target local ghm_disposable_test`);
  }
}

const issuerPool = new Pool({ connectionString: issuerUrl, ssl: false, max: 2, connectionTimeoutMillis: 5_000 });
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl: false, max: 1, connectionTimeoutMillis: 5_000 });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl: false, max: 1, connectionTimeoutMillis: 5_000 });

const issuerOnlyFunctionNames = [
  'auth_create_account',
  'auth_lookup_password_by_normalized_email',
  'auth_set_password',
  'auth_create_session_with_refresh',
  'auth_rotate_refresh',
  'auth_revoke_by_refresh_hash',
  'auth_issue_recovery',
  'auth_redeem_recovery',
  'auth_redeem_recovery_with_count',
  'auth_lookup_quoteflow_migration_reset_enrollment',
  'auth_complete_quoteflow_migration_reset',
].sort();

const expectPermissionDenied = async (sql, values = []) => {
  await assert.rejects(
    () => runtimePool.query(sql, values),
    (error) => error && error.code === '42501',
    `expected ghm_runtime to be denied: ${sql}`,
  );
};

try {
  const issuerFunctions = await issuerPool.query(`
    SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.proname LIKE 'auth\\_%' ESCAPE '\\'
       AND has_function_privilege(session_user, p.oid, 'EXECUTE')
     ORDER BY p.proname
  `);
  assert.deepEqual(
    issuerFunctions.rows.map((row) => row.proname).sort(),
    issuerOnlyFunctionNames,
    'issuer must have exactly the reviewed auth function allow-list',
  );

  const issuerTablePrivileges = await issuerPool.query(`
    SELECT c.relname AS table_name, privilege.privilege
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS privilege(privilege)
     WHERE n.nspname = 'ghm'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND has_table_privilege(session_user, c.oid, privilege.privilege)
     ORDER BY c.relname, privilege.privilege
  `);
  assert.deepEqual(issuerTablePrivileges.rows, [], 'issuer must not receive direct privileges on any GHM table/view; all access remains through reviewed SECURITY DEFINER functions');

  const deniedCalls = [
    'SELECT * FROM ghm.auth_create_account(NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer)',
    'SELECT * FROM ghm.auth_lookup_password_by_normalized_email(NULL::text)',
    'SELECT ghm.auth_set_password(NULL::bigint, NULL::text, NULL::text, NULL::text, NULL::integer, NULL::integer, NULL::integer)',
    'SELECT * FROM ghm.auth_create_session_with_refresh(NULL::bigint, NULL::bytea)',
    'SELECT * FROM ghm.auth_validate_session(NULL::bigint)',
    'SELECT * FROM ghm.auth_rotate_refresh(NULL::bytea, NULL::bytea)',
    'SELECT * FROM ghm.auth_revoke_by_refresh_hash(NULL::bytea, NULL::text)',
    'SELECT ghm.auth_issue_recovery(NULL::bigint, NULL::bytea, NULL::timestamptz)',
    'SELECT ghm.auth_redeem_recovery(NULL::bytea)',
    'SELECT * FROM ghm.auth_redeem_recovery_with_count(NULL::bytea)',
    'SELECT * FROM ghm.auth_lookup_quoteflow_migration_reset_enrollment(NULL::text)',
    'SELECT * FROM ghm.auth_complete_quoteflow_migration_reset(NULL::bytea, NULL::text, NULL::integer, NULL::integer, NULL::integer)',
  ];
  for (const sql of deniedCalls) await expectPermissionDenied(sql);

  const connectLookup = await runtimePool.query(
    'SELECT * FROM ghm.auth_lookup_external_identity($1, $2)',
    ['connect', `issuer-qualification-${randomUUID()}`],
  );
  assert.equal(connectLookup.rowCount, 0, 'Connect lookup-only external identity contract must remain available to runtime');

  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const keys = loadEs256Keys({
    GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    GHM_JWT_ES256_KID: 'auth-issuer-disposable',
  });
  const persistence = new PostgresAuthPersistence(issuerPool);
  const jwtService = createAccessJwtService(keys);
  const authService = createGhmAuthService(persistence, jwtService);
  const email = `auth-issuer-${randomUUID()}@example.test`;
  const initialPassword = 'CorrectHorse1';
  const replacementPassword = 'DifferentHorse2';

  const registered = await authService.register({
    fullName: 'Auth Issuer Qualification',
    role: 'customer',
    email,
    password: initialPassword,
  });
  assert.ok(registered.accountId > 0 && registered.sessionId > 0);

  const loggedIn = await authService.login(email, initialPassword);
  assert.equal(loggedIn.accountId, registered.accountId);

  const realHasher = createArgon2idPasswordHasher();
  const forcedRehashHasher = {
    hash: (password) => realHasher.hash(password),
    verify: async (passwordHash, password) => {
      const result = await realHasher.verify(passwordHash, password);
      return { ...result, needsRehash: result.verified || result.needsRehash };
    },
  };
  const rehashService = createGhmAuthService(persistence, jwtService, forcedRehashHasher);
  const rehashedLogin = await rehashService.login(email, initialPassword);
  assert.equal(rehashedLogin.accountId, registered.accountId);
  await authService.logout(rehashedLogin.refreshToken);
  const loginAfterRehash = await authService.login(email, initialPassword);
  assert.equal(loginAfterRehash.accountId, registered.accountId);
  await authService.logout(loginAfterRehash.refreshToken);

  const rotated = await authService.refresh(loggedIn.refreshToken);
  assert.equal(rotated.accountId, registered.accountId);
  await authService.logout(rotated.refreshToken);

  const recovery = await persistence.issueRecovery(registered.accountId, 30);
  const reset = await persistence.resetPasswordWithRecovery(
    recovery.recoveryTokenWire,
    email,
    replacementPassword,
  );
  assert.ok(reset.revokedSessionCount >= 1, 'recovery reset must revoke existing sessions');

  await assert.rejects(
    () => persistence.resetPasswordWithRecovery(recovery.recoveryTokenWire, email, 'AnotherHorse3'),
    (error) => error && error.code === 'RECOVERY_CREDENTIAL_INVALID',
  );
  await assert.rejects(
    () => authService.login(email, initialPassword),
    (error) => error && error.code === 'INVALID_CREDENTIALS',
  );

  const afterReset = await authService.login(email, replacementPassword);
  assert.equal(afterReset.accountId, registered.accountId);
  await authService.logout(afterReset.refreshToken);

  const quoteFlowEmail = `auth-issuer-quoteflow-${randomUUID()}@example.test`;
  const quoteFlowEmailNormalized = quoteFlowEmail.toLowerCase();
  const quoteFlowSubject = `auth-issuer-quoteflow-${randomUUID()}`;
  const ownerClient = await migratorPool.connect();
  let quoteFlowAccountId;
  try {
    await ownerClient.query('BEGIN');
    await ownerClient.query('SET LOCAL ROLE ghm_schema_owner');
    const accountResult = await ownerClient.query(
      `INSERT INTO ghm.account_identity (full_name, role, account_status, is_system_admin)
       VALUES ($1, 'customer', 'active', false)
       RETURNING id`,
      ['QuoteFlow Issuer Qualification'],
    );
    quoteFlowAccountId = Number(accountResult.rows[0].id);
    await ownerClient.query(
      `INSERT INTO ghm.account_external_identity (provider, subject, account_id)
       VALUES ('supabase', $1, $2)`,
      [quoteFlowSubject, quoteFlowAccountId],
    );
    await ownerClient.query(
      `INSERT INTO ghm.quoteflow_migration_reset_enrollment (
         account_id, source_provider, source_subject, approved_email,
         approved_email_normalized, source_evidence_reference, enrollment_status
       ) VALUES ($1, 'supabase', $2, $3, $4, $5, 'reset_required')`,
      [
        quoteFlowAccountId,
        quoteFlowSubject,
        quoteFlowEmail,
        quoteFlowEmailNormalized,
        `qualification:auth-issuer:${randomUUID()}`,
      ],
    );
    await ownerClient.query('COMMIT');
  } catch (error) {
    await ownerClient.query('ROLLBACK');
    throw error;
  } finally {
    ownerClient.release();
  }

  const enrollment = await persistence.lookupQuoteFlowMigrationResetEnrollment(quoteFlowEmail);
  assert.ok(enrollment);
  assert.equal(enrollment.accountId, quoteFlowAccountId);
  assert.equal(enrollment.approvedEmail, quoteFlowEmail);

  const quoteFlowRecovery = await persistence.issueRecovery(quoteFlowAccountId, 30);
  const completedMigrationReset = await persistence.completeQuoteFlowMigrationReset(
    quoteFlowRecovery.recoveryTokenWire,
    'QuoteFlowHorse4',
  );
  assert.equal(completedMigrationReset.accountId, quoteFlowAccountId);
  assert.equal(completedMigrationReset.loginEmail, quoteFlowEmail);
  assert.equal(await persistence.lookupQuoteFlowMigrationResetEnrollment(quoteFlowEmail), null);
  await assert.rejects(
    () => persistence.completeQuoteFlowMigrationReset(quoteFlowRecovery.recoveryTokenWire, 'QuoteFlowHorse5'),
    (error) => error && error.code === 'RECOVERY_CREDENTIAL_INVALID',
  );
  const quoteFlowLogin = await authService.login(quoteFlowEmail, 'QuoteFlowHorse4');
  assert.equal(quoteFlowLogin.accountId, quoteFlowAccountId);
  await authService.logout(quoteFlowLogin.refreshToken);

  process.stdout.write(JSON.stringify({
    issuerAllowList: issuerOnlyFunctionNames.length,
    issuerDirectRelationPrivileges: 0,
    runtimeIssuerFunctionDenials: deniedCalls.length,
    connectLookup: 'preserved',
    registrationLoginPasswordRehashRefreshLogout: 'passed',
    recoveryResetReplayAndSessionRevocation: 'passed',
    quoteFlowMigrationReset: 'passed',
  }) + '\\n');
} finally {
  await Promise.all([issuerPool.end(), runtimePool.end(), migratorPool.end()]);
}

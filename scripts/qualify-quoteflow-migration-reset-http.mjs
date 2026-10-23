import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import http from 'node:http';
import { Pool } from 'pg';
import 'dotenv/config';
import {
  assertMatchingPostgresTargets,
  assertNonProductionQualificationTarget,
  assertPostgresTargetConfiguration,
} from '../dist/db/postgres-target-guard.js';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const expectedDatabaseName = process.env.GHM_NONPRODUCTION_DATABASE_NAME;
const expectedDatabaseHost = process.env.GHM_NONPRODUCTION_DATABASE_HOST;
const pepperText = process.env.GHM_AUTH_TOKEN_PEPPER;
assert(runtimeUrl && migratorUrl && runtimeUrl !== migratorUrl, 'Distinct runtime and migrator database URLs are required');
assert(pepperText && Buffer.byteLength(pepperText, 'utf8') >= 32, 'GHM_AUTH_TOKEN_PEPPER must be at least 32 bytes');

const runtimeTarget = assertPostgresTargetConfiguration(runtimeUrl, {
  databaseName: expectedDatabaseName,
  host: expectedDatabaseHost,
  label: 'QuoteFlow reset HTTP runtime target',
});
const cleanupTarget = assertPostgresTargetConfiguration(migratorUrl, {
  databaseName: expectedDatabaseName,
  host: expectedDatabaseHost,
  label: 'QuoteFlow reset HTTP cleanup target',
});
assertMatchingPostgresTargets(runtimeTarget, cleanupTarget, 'QuoteFlow reset HTTP qualification target');
assertNonProductionQualificationTarget(runtimeTarget, 'QuoteFlow reset HTTP qualification');

process.env.CORS_ORIGINS ??= 'http://localhost';
const ssl = process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false };
const poolOptions = ssl ? { ssl } : {};
const runtimePool = new Pool({ connectionString: runtimeUrl, ...poolOptions, connectionTimeoutMillis: 15000 });
const cleanupPool = new Pool({ connectionString: migratorUrl, ...poolOptions, connectionTimeoutMillis: 15000 });
const runId = randomBytes(16).toString('hex');
const subject = `qualify-reset-http-${runId}`;
const email = `quoteflow-reset-http-${runId}@example.test`;
const approvedEmail = `QuoteFlow-Reset-Http-${runId}@example.test`;
const fixture = { accountIds: [], enrollmentIds: [] };
let server;
let deliveredRecovery = null;

const assertRuntimeIdentity = async () => {
  const { rows } = await runtimePool.query(
    'select current_database() as database_name, session_user, current_user',
  );
  assert.deepEqual(rows[0], {
    database_name: expectedDatabaseName,
    session_user: 'ghm_runtime',
    current_user: 'ghm_runtime',
  });
};
const assertCleanupIdentity = async () => {
  const { rows } = await cleanupPool.query(
    'select current_database() as database_name, session_user, current_user',
  );
  assert.deepEqual(rows[0], {
    database_name: expectedDatabaseName,
    session_user: 'ghm_migrator',
    current_user: 'ghm_migrator',
  });
};

const request = async (baseUrl, path, { method = 'GET', body, token } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};

try {
  await Promise.all([assertRuntimeIdentity(), assertCleanupIdentity()]);
  const { createApp } = await import('../dist/http/app.js');
  const { PostgresAuthPersistence } = await import('../dist/auth/foundation/persistence.js');
  const { createQuoteFlowMigrationResetRecoveryService } = await import('../dist/migrations/quoteflow-migration-reset-recovery.js');
  const { createQuoteFlowMigrationResetCompletionService } = await import('../dist/migrations/quoteflow-migration-reset-completion.js');
  const { createAccessJwtService } = await import('../dist/auth/foundation/access-jwt.js');
  const { loadEs256Keys } = await import('../dist/auth/foundation/es256-keys.js');
  const { createGhmBearerAuthenticator, PostgresAccountAuthStateStore } = await import('../dist/auth/ghm-bearer.js');
  const { createRequireResourceAuth } = await import('../dist/auth/resource-auth.js');

  const authPersistence = new PostgresAuthPersistence(runtimePool);
  const recoveryService = createQuoteFlowMigrationResetRecoveryService(authPersistence, {
    deliver: async (message) => { deliveredRecovery = message; },
  });
  const completionService = createQuoteFlowMigrationResetCompletionService(authPersistence);
  const bearerAuthenticator = createGhmBearerAuthenticator(
    createAccessJwtService(loadEs256Keys()),
    new PostgresAccountAuthStateStore(runtimePool),
  );
  server = http.createServer(createApp({
    authPersistence,
    quoteFlowMigrationResetRecoveryService: recoveryService,
    quoteFlowMigrationResetCompletionService: completionService,
    resourceAuthMiddleware: createRequireResourceAuth({ ghmAuthenticator: bearerAuthenticator }),
  }));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string', 'HTTP qualification server did not expose an address');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const provision = await runtimePool.query(
    'select * from ghm.auth_provision_migration_account($1,$2,$3,$4)',
    ['supabase', subject, 'QuoteFlow Reset HTTP Qualification', 'customer'],
  );
  assert.equal(provision.rows[0]?.outcome, 'created');
  const accountId = Number(provision.rows[0].account_id);
  fixture.accountIds.push(accountId);

  const registration = await runtimePool.query(
    'select * from ghm.auth_register_quoteflow_migration_reset_enrollment($1,$2,$3,$4,$5,$6)',
    [accountId, 'supabase', subject, approvedEmail, email, `synthetic/${runId}`],
  );
  assert.equal(registration.rows[0]?.outcome, 'created');
  fixture.enrollmentIds.push(Number(registration.rows[0].enrollment_id));

  const oldSessionHash = createHmac('sha256', Buffer.from(pepperText, 'utf8'))
    .update(randomBytes(32))
    .digest();
  const oldSession = await runtimePool.query(
    'select * from ghm.auth_create_session_with_refresh($1,$2)',
    [accountId, oldSessionHash],
  );
  assert.equal(oldSession.rowCount, 1);
  const oldSessionId = Number(oldSession.rows[0].session_id);

  // Unknown and eligible addresses have the same public response.
  const unknown = await request(baseUrl, '/api/v1/auth/quoteflow-migration-reset/request', {
    method: 'POST',
    body: { email: `unknown-${runId}@example.test` },
  });
  assert.equal(unknown.status, 202);
  assert.deepEqual(unknown.body, { ok: true });
  assert.equal(deliveredRecovery, null);

  const requested = await request(baseUrl, '/api/v1/auth/quoteflow-migration-reset/request', {
    method: 'POST',
    body: { email },
  });
  assert.equal(requested.status, 202);
  assert.deepEqual(requested.body, { ok: true });
  assert(deliveredRecovery?.recoveryToken, 'Eligible recovery request did not deliver a token');
  assert.equal(deliveredRecovery.accountId, accountId);

  const completed = await request(baseUrl, '/api/v1/auth/quoteflow-migration-reset/complete', {
    method: 'POST',
    body: { token: deliveredRecovery.recoveryToken, password: 'CorrectHorseBattery1' },
  });
  assert.equal(completed.status, 200, `Reset completion failed: ${JSON.stringify(completed.body)}`);
  assert.equal(completed.body.accountId, accountId);
  assert.equal(typeof completed.body.accessToken, 'string');
  assert.equal(typeof completed.body.refreshToken, 'string');
  assert.equal(Number.isInteger(completed.body.sessionId), true);

  const authenticatedProfile = await request(baseUrl, '/api/v1/profile', { token: completed.body.accessToken });
  assert.equal(authenticatedProfile.status, 200, `Fresh bearer token was not accepted: ${JSON.stringify(authenticatedProfile.body)}`);

  const replay = await request(baseUrl, '/api/v1/auth/quoteflow-migration-reset/complete', {
    method: 'POST',
    body: { token: deliveredRecovery.recoveryToken, password: 'AnotherCorrectHorse1' },
  });
  assert.equal(replay.status, 400);
  assert.deepEqual(replay.body, { error: 'invalid_recovery' });

  const verifier = await cleanupPool.connect();
  try {
    await verifier.query('begin');
    await verifier.query('set local role ghm_schema_owner');
    const enrollment = await verifier.query(
      'select enrollment_status from ghm.quoteflow_migration_reset_enrollment where id=$1',
      [fixture.enrollmentIds[0]],
    );
    assert.equal(enrollment.rows[0]?.enrollment_status, 'completed');

    const oldSessionState = await verifier.query(
      'select session_status from ghm.authentication_session where id=$1',
      [oldSessionId],
    );
    assert.equal(oldSessionState.rows[0]?.session_status, 'revoked');

    const credential = await verifier.query(
      'select credential_status, login_email_normalized from ghm.account_password_credential where account_id=$1',
      [accountId],
    );
    assert.equal(credential.rows[0]?.credential_status, 'active');
    assert.equal(credential.rows[0]?.login_email_normalized, email);

    const newSession = await verifier.query(
      'select session_status from ghm.authentication_session where id=$1 and account_id=$2',
      [completed.body.sessionId, accountId],
    );
    assert.equal(newSession.rows[0]?.session_status, 'active');
    await verifier.query('commit');
  } catch (error) {
    await verifier.query('rollback').catch(() => {});
    throw error;
  } finally {
    verifier.release();
  }

  console.log('QuoteFlow migration reset HTTP qualification: PASS');
  console.log(JSON.stringify({
    run_id: runId,
    checks: [
      'anti-enumerating unknown and eligible recovery requests',
      'recovery token delivered through the HTTP request ceremony',
      'atomic reset completion followed by session issuance',
      'fresh access token accepted by bearer-authenticated profile route',
      'existing session revoked and new session active',
      'recovery token replay rejected',
    ],
  }, null, 2));
} finally {
  if (server?.listening) await new Promise((resolve) => server.close(() => resolve()));
  if (fixture.accountIds.length > 0) {
    const cleanup = await cleanupPool.connect();
    try {
      await cleanup.query('begin');
      await cleanup.query('set local role ghm_schema_owner');
      await cleanup.query(
        'delete from ghm.quoteflow_migration_reset_enrollment where account_id = any($1::bigint[])',
        [fixture.accountIds],
      );
      await cleanup.query(
        'delete from ghm.password_recovery_credential where account_id = any($1::bigint[])',
        [fixture.accountIds],
      );
      await cleanup.query(
        'delete from ghm.refresh_credential where session_id in (select id from ghm.authentication_session where account_id = any($1::bigint[]))',
        [fixture.accountIds],
      );
      await cleanup.query('delete from ghm.authentication_session where account_id = any($1::bigint[])', [fixture.accountIds]);
      await cleanup.query('delete from ghm.account_external_identity where account_id = any($1::bigint[])', [fixture.accountIds]);
      await cleanup.query('delete from ghm.account_password_credential where account_id = any($1::bigint[])', [fixture.accountIds]);
      await cleanup.query('delete from ghm.account_identity where id = any($1::bigint[])', [fixture.accountIds]);
      await cleanup.query('commit');
    } catch (error) {
      await cleanup.query('rollback').catch(() => {});
      throw error;
    } finally {
      cleanup.release();
    }
  }
  await Promise.all([runtimePool.end(), cleanupPool.end()]);
}

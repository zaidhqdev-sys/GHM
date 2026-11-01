import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { Pool } from 'pg';
import 'dotenv/config';

assert.notEqual(process.env.NODE_ENV, 'production', 'Refusing to run qualification with NODE_ENV=production');
assert.equal(process.env.GHM_QUALIFICATION_ENV, 'non-production',
  'Set GHM_QUALIFICATION_ENV=non-production only after verifying the target database is isolated');
const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
assert(runtimeUrl && migratorUrl && runtimeUrl !== migratorUrl,
  'Set distinct non-production GHM_RUNTIME_DATABASE_URL and GHM_MIGRATOR_DATABASE_URL values');

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
const runtimePool = new Pool({ connectionString: runtimeUrl, ...(ssl ? { ssl } : {}) });
const migratorPool = new Pool({ connectionString: migratorUrl, ...(ssl ? { ssl } : {}) });
const runId = randomBytes(12).toString('hex');
const accounts = [];
const enrollments = [];
const oldSessions = [];
const deliveries = [];
let server;

const { PostgresAuthPersistence } = await import('../dist/auth/foundation/persistence.js');
const { createGhmAuthService } = await import('../dist/auth/ghm-auth-service.js');
const { createApp } = await import('../dist/http/app.js');
const { createQuoteFlowMigrationResetRecoveryService } = await import('../dist/migrations/quoteflow-migration-reset-recovery.js');
const { createQuoteFlowMigrationResetCompletionService } = await import('../dist/migrations/quoteflow-migration-reset-completion.js');

const persistence = new PostgresAuthPersistence(runtimePool);
const delivery = {
  async deliver(message) {
    // Keep raw credentials in memory only; never print or persist them.
    deliveries.push({ ...message });
  },
};
const app = createApp({
  authPersistence: persistence,
  authService: createGhmAuthService(persistence),
  quoteFlowMigrationResetRecoveryService:
    createQuoteFlowMigrationResetRecoveryService(persistence, delivery),
  quoteFlowMigrationResetCompletionService:
    createQuoteFlowMigrationResetCompletionService(persistence),
});

async function request(base, path, body) {
  const response = await fetch(new URL(path, base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function provision(runtime, suffix, withEnrollment) {
  const subject = `qualification-${runId}-${suffix}`;
  const email = `qf-reset-${runId}-${suffix}@example.test`;
  const result = await runtime.query(
    'select * from ghm.auth_provision_migration_account($1,$2,$3,$4)',
    ['supabase', subject, `Synthetic QuoteFlow Reset ${suffix}`, 'customer'],
  );
  assert.equal(result.rows[0].outcome, 'created');
  const accountId = Number(result.rows[0].account_id);
  accounts.push(accountId);
  if (withEnrollment) {
    const approvedEmail = `approved-${suffix}-${runId}@example.test`;
    const enrolled = await runtime.query(
      'select * from ghm.auth_register_quoteflow_migration_reset_enrollment($1,$2,$3,$4,$5,$6)',
      [accountId, 'supabase', subject, approvedEmail, email, `synthetic/${runId}/${suffix}`],
    );
    assert.equal(enrolled.rows[0].outcome, 'created');
    enrollments.push(Number(enrolled.rows[0].enrollment_id));
    const old = await persistence.createSessionWithRefresh(accountId);
    oldSessions.push({ accountId, sessionId: old.session.sessionId, refreshToken: old.refreshTokenWire });
    return { accountId, requestEmail: email, approvedEmail };
  }
  return { accountId, requestEmail: email };
}

async function cleanup() {
  if (server) await new Promise((resolve) => server.close(resolve));
  const migrator = await migratorPool.connect();
  try {
    await migrator.query('begin');
    await migrator.query('set local role ghm_schema_owner');
    for (const accountId of accounts) {
      await migrator.query('delete from ghm.quoteflow_migration_reset_enrollment where account_id=$1', [accountId]);
      await migrator.query('delete from ghm.password_recovery_credential where account_id=$1', [accountId]);
      await migrator.query('delete from ghm.refresh_credential where session_id in (select id from ghm.authentication_session where account_id=$1)', [accountId]);
      await migrator.query('delete from ghm.authentication_session where account_id=$1', [accountId]);
      await migrator.query('delete from ghm.account_external_identity where account_id=$1', [accountId]);
      await migrator.query('delete from ghm.account_password_credential where account_id=$1', [accountId]);
      await migrator.query('delete from ghm.account_identity where id=$1', [accountId]);
    }
    await migrator.query('commit');
  } catch (error) {
    await migrator.query('rollback').catch(() => {});
    throw error;
  } finally {
    migrator.release();
    await runtimePool.end();
    await migratorPool.end();
  }
}

try {
  const runtime = await runtimePool.connect();
  try {
    const who = await runtime.query('select current_user');
    assert.equal(who.rows[0].current_user, 'ghm_runtime',
      'Runtime connection must authenticate as ghm_runtime');
    const [first, second, ineligible] = await Promise.all([
      provision(runtime, 'one', true),
      provision(runtime, 'two', true),
      provision(runtime, 'ineligible', false),
    ]);
    assert.notEqual(first.accountId, second.accountId);
    assert.notEqual(first.approvedEmail, second.approvedEmail);
  } finally {
    runtime.release();
  }

  server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;

  const first = {
    accountId: accounts[0],
    requestEmail: `qf-reset-${runId}-one@example.test`,
    approvedEmail: `approved-one-${runId}@example.test`,
  };
  const second = {
    accountId: accounts[1],
    requestEmail: `qf-reset-${runId}-two@example.test`,
    approvedEmail: `approved-two-${runId}@example.test`,
  };
  const ineligibleEmail = `qf-reset-${runId}-ineligible@example.test`;

  const unknown = await request(base, '/api/v1/auth/quoteflow-migration-reset/request', {
    email: `unknown-${runId}@example.test`,
  });
  const ineligible = await request(base, '/api/v1/auth/quoteflow-migration-reset/request', {
    email: ineligibleEmail,
  });
  assert.equal(unknown.status, 202);
  assert.deepEqual(unknown.body, { ok: true });
  assert.equal(ineligible.status, 202);
  assert.deepEqual(ineligible.body, { ok: true });
  assert.equal(deliveries.length, 0, 'Unknown/ineligible addresses must not trigger delivery');

  for (const [index, account] of [first, second].entries()) {
    const requested = await request(base, '/api/v1/auth/quoteflow-migration-reset/request', {
      email: account.requestEmail,
    });
    assert.equal(requested.status, 202);
    assert.deepEqual(requested.body, { ok: true });
    const message = deliveries[index];
    assert(message, 'Expected one captured delivery per eligible synthetic account');
    assert.equal(message.accountId, account.accountId);
    assert.equal(message.email, account.approvedEmail,
      'Delivery must use approved enrollment address, not the request address');
    assert.equal(typeof message.recoveryToken, 'string');
  }

  const completedTokens = [];
  for (const [index, account] of [first, second].entries()) {
    const completed = await request(base, '/api/v1/auth/quoteflow-migration-reset/complete', {
      token: deliveries[index].recoveryToken,
      password: `Synthetic-Reset-${runId}-${index}-Strong9!`,
    });
    assert.equal(completed.status, 200, JSON.stringify(completed.body));
    assert.equal(Number(completed.body.accountId), account.accountId);
    assert.equal(typeof completed.body.accessToken, 'string');
    assert.equal(typeof completed.body.refreshToken, 'string');
    completedTokens.push(completed.body);

    const oldSession = await persistence.validateSession(oldSessions[index].sessionId);
    assert.equal(oldSession.isUsable, false, 'Pre-reset session must be revoked');
    assert.equal(oldSession.accountId, account.accountId);

    const refresh = await request(base, '/api/v1/auth/refresh', {
      refreshToken: completed.body.refreshToken,
    });
    assert.equal(refresh.status, 200, JSON.stringify(refresh.body));
    assert.equal(Number(refresh.body.accountId), account.accountId);
  }

  assert.notEqual(Number(completedTokens[0].accountId), Number(completedTokens[1].accountId));
  const replay = await request(base, '/api/v1/auth/quoteflow-migration-reset/complete', {
    token: deliveries[0].recoveryToken,
    password: `Synthetic-Replay-${runId}-Strong9!`,
  });
  assert.equal(replay.status, 400, 'Consumed recovery token must not be reusable');
  assert.deepEqual(replay.body, { error: 'invalid_recovery' });

  const [firstEnrollment, secondEnrollment] = await runtimePool.query(
    'select account_id, enrollment_status from ghm.quoteflow_migration_reset_enrollment where id = any($1::bigint[]) order by id',
    [enrollments],
  ).then((x) => x.rows);
  assert.equal(firstEnrollment.enrollment_status, 'completed');
  assert.equal(secondEnrollment.enrollment_status, 'completed');
  assert.notEqual(Number(firstEnrollment.account_id), Number(secondEnrollment.account_id));

  console.log('QuoteFlow migration reset HTTP E2E qualification: PASS');
  console.log(JSON.stringify({
    run_id: runId,
    synthetic_accounts: 3,
    checks: [
      'real HTTP request route backed by PostgresAuthPersistence',
      'unknown and ineligible requests have identical accepted response and no delivery',
      'eligible requests deliver only to each enrollment approved address',
      'two independent accounts complete reset through real HTTP route',
      'completion returns account-bound GHM access and refresh tokens',
      'pre-reset sessions are unusable after completion',
      'returned refresh tokens rotate successfully for the matching account',
      'recovery tokens are single-use',
      'both enrollment rows reach completed independently',
    ],
  }, null, 2));
} finally {
  // Always remove only the synthetic rows created by this run.
  await cleanup();
}

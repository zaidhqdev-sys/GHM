import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

const RUNTIME_DATABASE_URL = process.env.GHM_RUNTIME_DATABASE_URL;
const MIGRATOR_DATABASE_URL = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!RUNTIME_DATABASE_URL) throw new Error('Commercial trial qualification refused: GHM_RUNTIME_DATABASE_URL is not set.');
if (!MIGRATOR_DATABASE_URL) throw new Error('Commercial trial qualification refused: GHM_MIGRATOR_DATABASE_URL is not set.');
if (RUNTIME_DATABASE_URL === MIGRATOR_DATABASE_URL) throw new Error('Runtime and migrator connections must be distinct');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: RUNTIME_DATABASE_URL, ssl });
const cleanupPool = new Pool({ connectionString: MIGRATOR_DATABASE_URL, ssl });

const marker = `ghm-commercial-trial-${randomUUID()}`;
const code = `${marker.replaceAll('-', '_').toLowerCase().slice(0, 45)}_plan`;
const accounts = [];
const businesses = [];
const planVersions = [];
const trials = [];
const subscriptions = [];

const assertRejected = async (operation, pattern, label) => {
  await assert.rejects(operation, (error) => {
    assert.match(String(error?.message ?? error), pattern);
    return true;
  });
  console.log(`${label}`);
};

const identity = async (pool) => {
  const { rows } = await pool.query(`
    SELECT current_database() AS database_name, session_user, current_user, current_role
  `);
  return rows[0];
};

const cleanup = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    await client.query('DELETE FROM ghm.commercial_event WHERE business_id IN (SELECT id FROM ghm.business WHERE name LIKE $1)', [`${marker}%`]);
    await client.query('DELETE FROM ghm.commercial_subscription WHERE business_id IN (SELECT id FROM ghm.business WHERE name LIKE $1)', [`${marker}%`]);
    await client.query('DELETE FROM ghm.commercial_trial WHERE business_id IN (SELECT id FROM ghm.business WHERE name LIKE $1)', [`${marker}%`]);
    await client.query('DELETE FROM ghm.business_membership WHERE business_id IN (SELECT id FROM ghm.business WHERE name LIKE $1)', [`${marker}%`]);
    await client.query('DELETE FROM ghm.business WHERE name LIKE $1', [`${marker}%`]);
    await client.query('DELETE FROM ghm.commercial_plan_version WHERE plan_id IN (SELECT id FROM ghm.commercial_plan WHERE code = $1)', [code]);
    await client.query('DELETE FROM ghm.commercial_plan WHERE code = $1', [code]);
    await client.query('DELETE FROM ghm.account_identity WHERE full_name LIKE $1', [`${marker}%`]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const createAccount = async (fullName, role = 'business') => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows } = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, $2) RETURNING id`,
      [fullName, role],
    );
    await client.query('COMMIT');
    const id = Number(rows[0].id);
    accounts.push(id);
    return id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const createBusiness = async (ownerId, suffix) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows } = await client.query(
      `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active)
       VALUES ($1, $2, 'approved', true, true) RETURNING id`,
      [`${marker} ${suffix}`, `${marker.toLowerCase()}-${suffix.toLowerCase()}`],
    );
    const businessId = Number(rows[0].id);
    await client.query(
      `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
       VALUES ($1, $2, 'owner', 'active', $2)`,
      [businessId, ownerId],
    );
    await client.query('COMMIT');
    businesses.push(businessId);
    return businessId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const addMembership = async (businessId, accountId, role) => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    await client.query(
      `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
       VALUES ($1, $2, $3, 'active', $2)`,
      [businessId, accountId, role],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const createPlan = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows: planRows } = await client.query(
      `INSERT INTO ghm.commercial_plan (code, name, audience, lifecycle_status)
       VALUES ($1, $2, 'business', 'active') RETURNING id`,
      [code, `${marker} Plan`],
    );
    const planId = Number(planRows[0].id);
    const activatedAt = new Date(Date.now() - 60_000);
    const futureAt = new Date(Date.now() + 60_000);
    const { rows: versionRows } = await client.query(
      `INSERT INTO ghm.commercial_plan_version
        (plan_id, version, trial_days, effective_from, effective_until, lifecycle_status)
       VALUES
        ($1, 1, 7, $2, NULL, 'active'),
        ($1, 2, 14, $2, NULL, 'active'),
        ($1, 3, 21, $3, NULL, 'active')
       RETURNING id, version, trial_days`,
      [planId, activatedAt, futureAt],
    );
    await client.query('COMMIT');
    planVersions.push(...versionRows.map((row) => Number(row.id)));
    return { activatedAt, versions: versionRows };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const addFixtureEvidence = async (businessId) => {
  const { rows } = await runtimePool.query(
    `SELECT id, business_id, plan_version_id, activated_by, activated_at, expires_at,
            lifecycle_status, ended_at
     FROM ghm.commercial_trial WHERE business_id = $1`,
    [businessId],
  );
  assert.equal(rows.length, 1);
  trials.push(Number(rows[0].id));
  return rows[0];
};

try {
  const runtime = await identity(runtimePool);
  const migrator = await identity(cleanupPool);

  assert.deepEqual(
    runtime,
    { database_name: 'ghm_db', session_user: 'ghm_runtime', current_user: 'ghm_runtime', current_role: 'ghm_runtime' },
  );
  assert.deepEqual(
    migrator,
    { database_name: 'ghm_db', session_user: 'ghm_migrator', current_user: 'ghm_migrator', current_role: 'ghm_migrator' },
  );
  console.log('RUNTIME IDENTITY PASS: ghm_db/ghm_runtime');
  console.log('CLEANUP AUTHORITY PASS: ghm_db/ghm_migrator');

  const { versions } = await createPlan();
  assert.equal(versions.length, 3);
  console.log('PLAN FIXTURE PASS');

  const ownerId = await createAccount(`${marker} owner`);
  const administratorId = await createAccount(`${marker} administrator`);
  const memberId = await createAccount(`${marker} member`);
  const concurrentAdminId = await createAccount(`${marker} concurrent-admin`);

  const ownerBusinessId = await createBusiness(ownerId, 'OwnerBusiness');
  await addMembership(ownerBusinessId, administratorId, 'administrator');
  await addMembership(ownerBusinessId, memberId, 'member');
  console.log(`BUSINESS FIXTURE PASS: business=${ownerBusinessId}`);

  const ownerContext = { userId: ownerId, role: 'business' };
  const administratorContext = { userId: administratorId, role: 'business' };
  const memberContext = { userId: memberId, role: 'business' };

  const { DefaultCommercialService } = await import('../dist/resources/commercial/service.js');
  const { PostgresCommercialRepository } = await import('../dist/resources/commercial/repository.js');
  const repository = new PostgresCommercialRepository(runtimePool);
  const service = new DefaultCommercialService(repository);

  const ownerTrial = await service.activateCommercialTrial(ownerContext, { businessId: ownerBusinessId, planCode: code });
  assert.equal(ownerTrial.planVersionId, Number(versions.find((row) => Number(row.version) === 2).id));
  assert.equal(ownerTrial.activatedByAccountId, ownerId);
  console.log(`OWNER TRIAL ACTIVATION PASS: trial=${ownerTrial.id}`);

  const ownerRow = await addFixtureEvidence(ownerBusinessId);
  assert.equal(ownerRow.lifecycle_status, 'active');
  assert.equal(ownerRow.ended_at, null);
  assert.equal(Number(ownerRow.plan_version_id), ownerTrial.planVersionId);
  assert.equal(Number(ownerRow.activated_by), ownerId);
  assert.equal(new Date(ownerRow.expires_at).getTime(), new Date(ownerRow.activated_at).getTime() + 14 * 86400000);
  console.log('TRIAL ROW CORRECTNESS PASS');

  const { rows: subscriptionRows } = await runtimePool.query(
    `SELECT id, business_id, plan_version_id, price_id, trial_id, lifecycle_status,
            current_period_start, current_period_end, provider_reference
     FROM ghm.commercial_subscription WHERE business_id = $1`,
    [ownerBusinessId],
  );
  assert.equal(subscriptionRows.length, 1);
  const subscription = subscriptionRows[0];
  subscriptions.push(Number(subscription.id));
  assert.equal(Number(subscription.plan_version_id), ownerTrial.planVersionId);
  assert.equal(subscription.price_id, null);
  assert.equal(Number(subscription.trial_id), ownerTrial.id);
  assert.equal(subscription.lifecycle_status, 'trialing');
  assert.equal(subscription.provider_reference, null);
  assert.equal(new Date(subscription.current_period_end).getTime(), new Date(ownerRow.expires_at).getTime());
  console.log('TRIALING SUBSCRIPTION CORRECTNESS PASS');

  const eventClient = await cleanupPool.connect();
  let eventRows;
  try {
    await eventClient.query('BEGIN');
    await eventClient.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await eventClient.query(
      `SELECT id, business_id, subscription_id, event_type, actor_account_id, source, payload
       FROM ghm.commercial_event
       WHERE business_id = $1 AND event_type = 'trial_activated'
       ORDER BY id DESC`,
      [ownerBusinessId],
    );
    eventRows = result.rows;
    await eventClient.query('COMMIT');
  } catch (error) {
    await eventClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    eventClient.release();
  }

  assert.equal(eventRows.length, 1);
  assert.equal(Number(eventRows[0].subscription_id), Number(subscription.id));
  assert.equal(Number(eventRows[0].actor_account_id), ownerId);
  assert.equal(eventRows[0].source, 'ghm.commercial');
  assert.equal(Number(eventRows[0].payload.plan_version_id), ownerTrial.planVersionId);
  assert.equal(Number(eventRows[0].payload.trial_id), ownerTrial.id);
  console.log('TRIAL ACTIVATION EVENT PASS');

  await assertRejected(
    () => service.activateCommercialTrial(memberContext, { businessId: ownerBusinessId, planCode: code }),
    /Business management permission required/,
    'MEMBER DENIAL PASS',
  );

  const beforeDuplicate = await runtimePool.query(
    `SELECT count(*)::int AS count FROM ghm.commercial_trial WHERE business_id = $1`,
    [ownerBusinessId],
  );
  assert.equal(beforeDuplicate.rows[0].count, 1);
  await assertRejected(
    () => service.activateCommercialTrial(ownerContext, { businessId: ownerBusinessId, planCode: code }),
    /duplicate key|unique/i,
    'DUPLICATE TRIAL DENIAL PASS',
  );
  const afterDuplicate = await runtimePool.query(
    `SELECT count(*)::int AS count FROM ghm.commercial_trial WHERE business_id = $1`,
    [ownerBusinessId],
  );
  assert.equal(afterDuplicate.rows[0].count, 1);
  console.log('DUPLICATE STATE PRESERVATION PASS');

  await assertRejected(
    () => service.activateCommercialTrial(ownerContext, { businessId: ownerBusinessId, planCode: `${code}_missing` }),
    /Eligible commercial plan not found/,
    'INELIGIBLE PLAN DENIAL PASS',
  );

  const adminBusinessId = await createBusiness(ownerId, 'AdministratorBusiness');
  await addMembership(adminBusinessId, administratorId, 'administrator');
  const adminTrial = await service.activateCommercialTrial(administratorContext, { businessId: adminBusinessId, planCode: code });
  assert.equal(adminTrial.activatedByAccountId, administratorId);
  assert.equal(adminTrial.planVersionId, Number(versions.find((row) => Number(row.version) === 2).id));
  console.log(`ADMINISTRATOR TRIAL ACTIVATION PASS: trial=${adminTrial.id}`);

  const concurrentBusinessId = await createBusiness(ownerId, 'ConcurrentBusiness');
  await addMembership(concurrentBusinessId, concurrentAdminId, 'administrator');
  const concurrentContext = { userId: concurrentAdminId, role: 'business' };
  const concurrentResults = await Promise.allSettled([
    service.activateCommercialTrial(ownerContext, { businessId: concurrentBusinessId, planCode: code }),
    service.activateCommercialTrial(concurrentContext, { businessId: concurrentBusinessId, planCode: code }),
  ]);
  const successes = concurrentResults.filter((result) => result.status === 'fulfilled');
  const failures = concurrentResults.filter((result) => result.status === 'rejected');
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  console.log('CONCURRENT TRIAL PROTECTION PASS: success=1 failure=1');

  const { rows: concurrentState } = await runtimePool.query(
    `SELECT
       (SELECT count(*) FROM ghm.commercial_trial WHERE business_id = $1) AS trial_count,
       (SELECT count(*) FROM ghm.commercial_subscription WHERE business_id = $1) AS subscription_count`,
    [concurrentBusinessId],
  );

  const concurrentEventClient = await cleanupPool.connect();
  let concurrentEventCount;
  try {
    await concurrentEventClient.query('BEGIN');
    await concurrentEventClient.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await concurrentEventClient.query(
      `SELECT count(*) AS event_count
       FROM ghm.commercial_event
       WHERE business_id = $1 AND event_type = 'trial_activated'`,
      [concurrentBusinessId],
    );
    concurrentEventCount = Number(result.rows[0].event_count);
    await concurrentEventClient.query('COMMIT');
  } catch (error) {
    await concurrentEventClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    concurrentEventClient.release();
  }

  assert.equal(Number(concurrentState[0].trial_count), 1);
  assert.equal(Number(concurrentState[0].subscription_count), 1);
  assert.equal(concurrentEventCount, 1);
  console.log('CONCURRENT STATE ATOMICITY PASS');

  await assertRejected(
    () => runtimePool.query(`UPDATE ghm.commercial_trial SET ended_at = now() WHERE id = $1`, [ownerTrial.id]),
    /permission denied/i,
    'RUNTIME TRIAL UPDATE DENIAL PASS',
  );
  await assertRejected(
    () => runtimePool.query(`DELETE FROM ghm.commercial_trial WHERE id = $1`, [ownerTrial.id]),
    /permission denied/i,
    'RUNTIME TRIAL DELETE DENIAL PASS',
  );
  await assertRejected(
    () => runtimePool.query(`INSERT INTO ghm.commercial_trial (business_id, plan_version_id, activated_by, expires_at, ended_at) VALUES ($1, $2, $3, now() + interval '1 day', now())`, [ownerBusinessId, Number(versions[0].id), ownerId]),
    /permission denied/i,
    'RUNTIME TRIAL INSERT DENIAL PASS',
  );
  await assertRejected(
    () => runtimePool.query(`UPDATE ghm.commercial_subscription SET provider_reference = 'x' WHERE id = $1`, [Number(subscription.id)]),
    /permission denied/i,
    'RUNTIME SUBSCRIPTION UPDATE DENIAL PASS',
  );
  await assertRejected(
    () => runtimePool.query(`DELETE FROM ghm.commercial_subscription WHERE id = $1`, [Number(subscription.id)]),
    /permission denied/i,
    'RUNTIME SUBSCRIPTION DELETE DENIAL PASS',
  );
  await assertRejected(
    () => runtimePool.query(`SELECT id FROM ghm.commercial_event LIMIT 1`),
    /permission denied/i,
    'RUNTIME COMMERCIAL EVENT READ DENIAL PASS',
  );

  const aclClient = await cleanupPool.connect();
  let acl;
  try {
    await aclClient.query('BEGIN');
    await aclClient.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await aclClient.query(`
      SELECT
        has_table_privilege('ghm_runtime', 'ghm.commercial_trial', 'SELECT') AS trial_select,
        has_table_privilege('ghm_runtime', 'ghm.commercial_trial', 'INSERT') AS trial_insert,
        has_table_privilege('ghm_runtime', 'ghm.commercial_trial', 'UPDATE') AS trial_update,
        has_table_privilege('ghm_runtime', 'ghm.commercial_trial', 'DELETE') AS trial_delete,
        has_table_privilege('ghm_runtime', 'ghm.commercial_subscription', 'SELECT') AS subscription_select,
        has_table_privilege('ghm_runtime', 'ghm.commercial_subscription', 'INSERT') AS subscription_insert,
        has_table_privilege('ghm_runtime', 'ghm.commercial_subscription', 'UPDATE') AS subscription_update,
        has_table_privilege('ghm_runtime', 'ghm.commercial_subscription', 'DELETE') AS subscription_delete,
        has_table_privilege('ghm_runtime', 'ghm.commercial_event', 'SELECT') AS event_select
    `);
    acl = result.rows;
    await aclClient.query('COMMIT');
  } catch (error) {
    await aclClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    aclClient.release();
  }
  assert.deepEqual(acl[0], {
    trial_select: true, trial_insert: false, trial_update: false, trial_delete: false,
    subscription_select: true, subscription_insert: false, subscription_update: false, subscription_delete: false,
    event_select: false,
  });
  console.log('RUNTIME COMMERCIAL ACL PASS');

  console.log('COMMERCIAL TRIAL RUNTIME QUALIFICATION PASS');
} finally {
  await cleanup().catch((error) => console.error(`QUALIFICATION CLEANUP ERROR: ${error instanceof Error ? error.message : String(error)}`));
  await runtimePool.end();
  await cleanupPool.end();
}

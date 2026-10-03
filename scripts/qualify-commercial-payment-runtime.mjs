import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl) throw new Error('Missing GHM runtime/migrator database URLs');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl });

const expectPermissionDenied = async (work, label) => {
  try {
    await work();
  } catch (error) {
    if (!String(error?.message).toLowerCase().includes('permission denied')) {
      throw new Error(`${label}: unexpected error: ${error?.message}`);
    }
    console.log(`${label}: PASS`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const paymentAttemptInsertColumns = [
  'business_id', 'subscription_id', 'price_id', 'initiated_by',
  'attempt_status', 'amount_minor_units', 'currency_id', 'billing_interval',
  'idempotency_key', 'expires_at',
];
const eventInsertColumns = [
  'business_id', 'subscription_id', 'event_type', 'actor_account_id',
  'source', 'idempotency_key', 'payload', 'occurred_at',
];

let fixture;
try {
  const identity = (await runtimePool.query(
    'SELECT current_database(), session_user, current_user, current_role',
  )).rows[0];

  if (
    identity.current_database !== 'ghm_db' ||
    identity.session_user !== 'ghm_runtime' ||
    identity.current_user !== 'ghm_runtime' ||
    identity.current_role !== 'ghm_runtime'
  ) {
    throw new Error(`Unexpected runtime identity: ${JSON.stringify(identity)}`);
  }
  console.log('COMMERCIAL RUNTIME IDENTITY PASS');

  const columnPrivilegeSql = (table, columns) => columns.map((column) =>
    `has_column_privilege(current_user, '${table}', '${column}', 'INSERT') AS ${table.split('.')[1]}_${column}`,
  ).join(',\n      ');

  const privileges = (await runtimePool.query(`
    SELECT
      has_table_privilege(current_user, 'ghm.commercial_payment_attempt', 'SELECT') AS attempt_select,
      has_table_privilege(current_user, 'ghm.commercial_payment_attempt', 'UPDATE') AS attempt_update,
      has_table_privilege(current_user, 'ghm.commercial_payment_attempt', 'DELETE') AS attempt_delete,
      has_table_privilege(current_user, 'ghm.commercial_event', 'SELECT') AS event_select,
      has_table_privilege(current_user, 'ghm.commercial_event', 'UPDATE') AS event_update,
      has_table_privilege(current_user, 'ghm.commercial_event', 'DELETE') AS event_delete,
      has_sequence_privilege(current_user, 'ghm.commercial_payment_attempt_id_seq', 'USAGE') AS attempt_seq_usage,
      has_sequence_privilege(current_user, 'ghm.commercial_event_id_seq', 'USAGE') AS event_seq_usage,
      ${columnPrivilegeSql('ghm.commercial_payment_attempt', paymentAttemptInsertColumns)},
      ${columnPrivilegeSql('ghm.commercial_event', eventInsertColumns)}
  `)).rows[0];

  const attemptColumnsGranted = paymentAttemptInsertColumns.every(
    (column) => privileges[`commercial_payment_attempt_${column}`] === true,
  );
  const eventColumnsGranted = eventInsertColumns.every(
    (column) => privileges[`commercial_event_${column}`] === true,
  );

  if (
    !privileges.attempt_select ||
    privileges.attempt_update ||
    privileges.attempt_delete ||
    privileges.event_select ||
    privileges.event_update ||
    privileges.event_delete ||
    !privileges.attempt_seq_usage ||
    !privileges.event_seq_usage ||
    !attemptColumnsGranted ||
    !eventColumnsGranted
  ) {
    throw new Error(`Unexpected Commercial runtime privileges: ${JSON.stringify(privileges)}`);
  }
  console.log('COMMERCIAL PAYMENT COLUMN WRITE PRIVILEGE PASS');

  await expectPermissionDenied(
    () => runtimePool.query(
      "UPDATE ghm.commercial_payment_attempt SET failure_message = 'forbidden' WHERE false",
    ),
    'RUNTIME PAYMENT ATTEMPT UPDATE DENIAL',
  );
  await expectPermissionDenied(
    () => runtimePool.query(
      "DELETE FROM ghm.commercial_payment_attempt WHERE false",
    ),
    'RUNTIME PAYMENT ATTEMPT DELETE DENIAL',
  );
  await expectPermissionDenied(
    () => runtimePool.query(
      "UPDATE ghm.commercial_event SET source = 'forbidden' WHERE false",
    ),
    'RUNTIME COMMERCIAL EVENT UPDATE DENIAL',
  );
  await expectPermissionDenied(
    () => runtimePool.query(
      "DELETE FROM ghm.commercial_event WHERE false",
    ),
    'RUNTIME COMMERCIAL EVENT DELETE DENIAL',
  );

  const setup = await migratorPool.connect();
  try {
    await setup.query('SET ROLE ghm_schema_owner');
    const setupIdentity = (await setup.query(
      'SELECT session_user, current_user, current_role',
    )).rows[0];
    if (
      setupIdentity.session_user !== 'ghm_migrator' ||
      setupIdentity.current_user !== 'ghm_schema_owner' ||
      setupIdentity.current_role !== 'ghm_schema_owner'
    ) {
      throw new Error(`Unexpected Commercial fixture setup identity: ${JSON.stringify(setupIdentity)}`);
    }

    await setup.query('BEGIN');

    const account = (await setup.query(`
      INSERT INTO ghm.account_identity (full_name, role)
      VALUES ('Commercial Payment Runtime Qualification', 'business')
      RETURNING id
    `)).rows[0];

    const business = (await setup.query(`
      INSERT INTO ghm.business (name, slug, verification_status, is_verified)
      VALUES ('Commercial Payment Runtime Qualification', $1, 'approved', true)
      RETURNING id
    `, [`commercial-payment-runtime-${Date.now()}`])).rows[0];

    await setup.query(`
      INSERT INTO ghm.business_membership (
        business_id, account_id, membership_role, membership_status, created_by
      )
      VALUES ($1, $2, 'owner', 'active', $2)
    `, [business.id, account.id]);

    const plan = (await setup.query(`
      INSERT INTO ghm.commercial_plan (code, name, lifecycle_status)
      VALUES ($1, 'Commercial Payment Runtime Qualification', 'active')
      RETURNING id
    `, [`runtime_qualification_${Date.now()}`])).rows[0];

    const now = new Date();
    const version = (await setup.query(`
      INSERT INTO ghm.commercial_plan_version (
        plan_id, version, trial_days, effective_from, lifecycle_status
      )
      VALUES ($1, 1, 0, $2, 'active')
      RETURNING id
    `, [plan.id, now])).rows[0];

    const currency = (await setup.query(`
      SELECT id
      FROM ghm.currency
      WHERE code = 'ZAR' AND is_active = true
      LIMIT 1
    `)).rows[0];
    if (!currency) throw new Error('Expected canonical ZAR currency reference row');

    const price = (await setup.query(`
      INSERT INTO ghm.commercial_plan_price (
        plan_version_id, currency_id, price_kind, amount_minor_units,
        billing_interval, effective_from, lifecycle_status
      )
      VALUES ($1, $2, 'standard', 19900, 'month', $3, 'active')
      RETURNING id
    `, [version.id, currency.id, now])).rows[0];

    const subscription = (await setup.query(`
      INSERT INTO ghm.commercial_subscription (
        business_id, plan_version_id, price_id, lifecycle_status
      )
      VALUES ($1, $2, $3, 'active')
      RETURNING id
    `, [business.id, version.id, price.id])).rows[0];

    fixture = {
      accountId: Number(account.id),
      businessId: Number(business.id),
      planId: Number(plan.id),
      versionId: Number(version.id),
      priceId: Number(price.id),
      subscriptionId: Number(subscription.id),
    };

    await setup.query('COMMIT');
  } catch (error) {
    await setup.query('ROLLBACK');
    throw error;
  } finally {
    setup.release();
  }

  const runtime = await runtimePool.connect();
  try {
    await runtime.query('BEGIN');

    const key = `runtime-qualification-${Date.now()}`;
    const attempt = (await runtime.query(`
      INSERT INTO ghm.commercial_payment_attempt (
        business_id, subscription_id, price_id, initiated_by,
        attempt_status, amount_minor_units, currency_id, billing_interval,
        idempotency_key, expires_at
      )
      VALUES ($1, $2, $3, $4, 'pending_checkout', 19900, $5, 'month', $6, now())
      RETURNING id
    `, [
      fixture.businessId,
      fixture.subscriptionId,
      fixture.priceId,
      fixture.accountId,
      (await runtime.query("SELECT id FROM ghm.currency WHERE code = 'ZAR' LIMIT 1")).rows[0].id,
      key,
    ])).rows[0];

    await runtime.query(`
      INSERT INTO ghm.commercial_event (
        business_id, subscription_id, event_type, actor_account_id,
        source, idempotency_key, payload, occurred_at
      )
      VALUES ($1, $2, 'subscription_payment_prepared', $3, 'qualification', $4, '{}'::jsonb, now())
    `, [fixture.businessId, fixture.subscriptionId, fixture.accountId, key]);

    if (!attempt?.id) throw new Error('Runtime payment attempt insert did not return an id');
    console.log('RUNTIME PAYMENT ATTEMPT INSERT PASS');
    console.log('RUNTIME COMMERCIAL EVENT INSERT PASS');

    await runtime.query('ROLLBACK');
    console.log('RUNTIME PAYMENT WRITE ROLLBACK PASS');
  } finally {
    runtime.release();
  }
} finally {
  if (fixture) {
    const cleanup = await migratorPool.connect();
    try {
      await cleanup.query('SET ROLE ghm_schema_owner');
      const cleanupIdentity = (await cleanup.query(
        'SELECT session_user, current_user, current_role',
      )).rows[0];
      if (
        cleanupIdentity.session_user !== 'ghm_migrator' ||
        cleanupIdentity.current_user !== 'ghm_schema_owner' ||
        cleanupIdentity.current_role !== 'ghm_schema_owner'
      ) {
        throw new Error(`Unexpected Commercial fixture cleanup identity: ${JSON.stringify(cleanupIdentity)}`);
      }

      await cleanup.query('BEGIN');
      await cleanup.query('DELETE FROM ghm.commercial_subscription WHERE id = $1', [fixture.subscriptionId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan_price WHERE id = $1', [fixture.priceId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan_version WHERE id = $1', [fixture.versionId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan WHERE id = $1', [fixture.planId]);
      await cleanup.query('DELETE FROM ghm.business_membership WHERE business_id = $1', [fixture.businessId]);
      await cleanup.query('DELETE FROM ghm.business WHERE id = $1', [fixture.businessId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id = $1', [fixture.accountId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id = $1', [fixture.accountId]);
      await cleanup.query('COMMIT');
    } catch (error) {
      await cleanup.query('ROLLBACK');
      throw error;
    } finally {
      cleanup.release();
    }
  }
  await runtimePool.end();
  await migratorPool.end();
}

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
  try { await work(); } catch (error) {
    if (!String(error?.message).toLowerCase().includes('permission denied')) throw new Error(`${label}: unexpected error: ${error?.message}`);
    console.log(`${label}: PASS`); return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

let fixture;
try {
  const runtime = await runtimePool.connect();
  try {
    const identity = (await runtime.query('SELECT current_database(), session_user, current_user, current_role')).rows[0];
    if (identity.current_database !== 'ghm_db' || identity.session_user !== 'ghm_runtime' || identity.current_user !== 'ghm_runtime' || identity.current_role !== 'ghm_runtime') {
      throw new Error(`Unexpected runtime identity: ${JSON.stringify(identity)}`);
    }
    console.log('COMMERCIAL PAYMENT RESULT RUNTIME IDENTITY PASS');

    const privilege = (await runtime.query(`
      SELECT has_function_privilege(
        current_user,
        'ghm.commercial_apply_payment_result(bigint,text,text,text,text,text,text,text,timestamptz,jsonb)',
        'EXECUTE'
      ) AS execute_granted
    `)).rows[0];
    if (!privilege.execute_granted) throw new Error('Runtime lacks commercial payment result function EXECUTE privilege');
    console.log('COMMERCIAL PAYMENT RESULT FUNCTION EXECUTE PASS');

    await expectPermissionDenied(
      () => runtime.query("INSERT INTO ghm.commercial_provider_event (provider_code, provider_event_id, event_type, payload_hash) VALUES ('payfast', 'qualification-direct', 'direct', repeat('a', 64))"),
      'RUNTIME PROVIDER EVENT DIRECT INSERT DENIAL',
    );
    await expectPermissionDenied(
      () => runtime.query("INSERT INTO ghm.commercial_payment_transaction (business_id, subscription_id, amount_minor_units, currency_id, occurred_at) VALUES (1, 1, 19900, 1, now())"),
      'RUNTIME PAYMENT TRANSACTION DIRECT INSERT DENIAL',
    );
  } finally { runtime.release(); }

  const setup = await migratorPool.connect();
  try {
    await setup.query('SET ROLE ghm_schema_owner');
    await setup.query('BEGIN');
    const account = (await setup.query(`
      INSERT INTO ghm.account_identity (full_name, role)
      VALUES ('Commercial Payment Result Qualification', 'business') RETURNING id
    `)).rows[0];
    const business = (await setup.query(`
      INSERT INTO ghm.business (name, slug, verification_status, is_verified)
      VALUES ('Commercial Payment Result Qualification', $1, 'approved', true) RETURNING id
    `, [`commercial-result-runtime-${Date.now()}`])).rows[0];
    await setup.query(`
      INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
      VALUES ($1, $2, 'owner', 'active', $2)
    `, [business.id, account.id]);
    const plan = (await setup.query(`
      INSERT INTO ghm.commercial_plan (code, name, lifecycle_status)
      VALUES ($1, 'Commercial Payment Result Qualification', 'active') RETURNING id
    `, [`commercial_result_${Date.now()}`])).rows[0];
    const now = new Date();
    const version = (await setup.query(`
      INSERT INTO ghm.commercial_plan_version (plan_id, version, trial_days, effective_from, lifecycle_status)
      VALUES ($1, 1, 0, $2, 'active') RETURNING id
    `, [plan.id, now])).rows[0];
    const currency = (await setup.query("SELECT id FROM ghm.currency WHERE code = 'ZAR' AND is_active = true LIMIT 1")).rows[0];
    if (!currency) throw new Error('Expected canonical ZAR currency reference row');
    const price = (await setup.query(`
      INSERT INTO ghm.commercial_plan_price (plan_version_id, currency_id, price_kind, amount_minor_units, billing_interval, effective_from, lifecycle_status)
      VALUES ($1, $2, 'standard', 19900, 'month', $3, 'active') RETURNING id
    `, [version.id, currency.id, now])).rows[0];
    const subscription = (await setup.query(`
      INSERT INTO ghm.commercial_subscription (business_id, plan_version_id, price_id, lifecycle_status)
      VALUES ($1, $2, $3, 'past_due') RETURNING id
    `, [business.id, version.id, price.id])).rows[0];
    const attempt = (await setup.query(`
      INSERT INTO ghm.commercial_payment_attempt (
        business_id, subscription_id, price_id, initiated_by, attempt_status,
        amount_minor_units, currency_id, billing_interval, idempotency_key
      ) VALUES ($1, $2, $3, $4, 'pending_payment', 19900, $5, 'month', $6)
      RETURNING id
    `, [business.id, subscription.id, price.id, account.id, currency.id, `result-${Date.now()}`])).rows[0];
    fixture = { accountId:Number(account.id), businessId:Number(business.id), planId:Number(plan.id), versionId:Number(version.id), priceId:Number(price.id), subscriptionId:Number(subscription.id), attemptId:Number(attempt.id) };
    await setup.query('COMMIT');
  } catch (error) {
    await setup.query('ROLLBACK'); throw error;
  } finally { setup.release(); }

  const runtime = await runtimePool.connect();
  try {
    await runtime.query('BEGIN');
    const result = (await runtime.query(`
      SELECT * FROM ghm.commercial_apply_payment_result(
        $1, 'payfast', 'qualification-event-1', 'payment_complete',
        repeat('b', 64), 'payment', 'succeeded', 'PF-QUAL-1', now(), '{"qualification":true}'::jsonb
      )
    `, [fixture.attemptId])).rows[0];
    if (!result?.id || result.transaction_status !== 'succeeded') throw new Error('Commercial payment result function did not create succeeded transaction');
    const state = (await runtime.query('SELECT attempt_status FROM ghm.commercial_payment_attempt WHERE id = $1', [fixture.attemptId])).rows[0];
    if (state.attempt_status !== 'succeeded') throw new Error(`Payment attempt state was not advanced: ${state.attempt_status}`);
    const subscription = (await runtime.query('SELECT lifecycle_status FROM ghm.commercial_subscription WHERE id = $1', [fixture.subscriptionId])).rows[0];
    if (subscription.lifecycle_status !== 'active') throw new Error(`Subscription state was not activated: ${subscription.lifecycle_status}`);
    console.log('RUNTIME COMMERCIAL PAYMENT RESULT APPLY PASS');
    await runtime.query('ROLLBACK');
    console.log('RUNTIME COMMERCIAL PAYMENT RESULT ROLLBACK PASS');
  } finally { runtime.release(); }
} finally {
  if (fixture) {
    const cleanup = await migratorPool.connect();
    try {
      await cleanup.query('SET ROLE ghm_schema_owner');
      await cleanup.query('BEGIN');
      await cleanup.query('DELETE FROM ghm.commercial_payment_attempt WHERE id = $1', [fixture.attemptId]);
      await cleanup.query('DELETE FROM ghm.commercial_subscription WHERE id = $1', [fixture.subscriptionId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan_price WHERE id = $1', [fixture.priceId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan_version WHERE id = $1', [fixture.versionId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan WHERE id = $1', [fixture.planId]);
      await cleanup.query('DELETE FROM ghm.business_membership WHERE business_id = $1', [fixture.businessId]);
      await cleanup.query('DELETE FROM ghm.business WHERE id = $1', [fixture.businessId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id = $1', [fixture.accountId]);
      await cleanup.query('COMMIT');
    } catch (error) { await cleanup.query('ROLLBACK'); throw error; }
    finally { cleanup.release(); }
  }
  await runtimePool.end(); await migratorPool.end();
}

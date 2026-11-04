import { Pool } from 'pg';
import 'dotenv/config';
import {
  assertMatchingPostgresTargets,
  assertNonProductionQualificationTarget,
  assertPostgresTargetConfiguration,
} from '../dist/db/postgres-target-guard.js';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const providerUrl = process.env.GHM_PAYMENT_PROVIDER_DATABASE_URL;
if (!runtimeUrl || !migratorUrl || !providerUrl) throw new Error('Missing GHM runtime/migrator/provider database URLs');
if (new Set([runtimeUrl, migratorUrl, providerUrl]).size !== 3) throw new Error('Runtime, migrator and provider connections must be distinct');

const expectedDatabaseName = process.env.GHM_QUALIFICATION_DATABASE_NAME ?? process.env.GHM_NONPRODUCTION_DATABASE_NAME;
const expectedDatabaseHost = process.env.GHM_QUALIFICATION_DATABASE_HOST ?? process.env.GHM_NONPRODUCTION_DATABASE_HOST;
const runtimeTarget = assertPostgresTargetConfiguration(runtimeUrl, {
  databaseName: expectedDatabaseName, host: expectedDatabaseHost, label: 'GHM payment-result runtime qualification target',
});
const migratorTarget = assertPostgresTargetConfiguration(migratorUrl, {
  databaseName: expectedDatabaseName, host: expectedDatabaseHost, label: 'GHM payment-result fixture authority target',
});
const providerTarget = assertPostgresTargetConfiguration(providerUrl, {
  databaseName: expectedDatabaseName, host: expectedDatabaseHost, label: 'GHM payment-result provider target',
});
assertMatchingPostgresTargets(runtimeTarget, migratorTarget, 'GHM payment-result runtime/fixture target');
assertMatchingPostgresTargets(runtimeTarget, providerTarget, 'GHM payment-result runtime/provider target');
assertNonProductionQualificationTarget(runtimeTarget, 'GHM payment-result qualification');

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false;
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl });
const providerPool = new Pool({ connectionString: providerUrl, ssl });

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
    if (identity.current_database !== (process.env.GHM_QUALIFICATION_DATABASE_NAME ?? 'ghm') || identity.session_user !== 'ghm_runtime' || identity.current_user !== 'ghm_runtime' || identity.current_role !== 'ghm_runtime') {
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
    if (privilege.execute_granted) throw new Error('Runtime unexpectedly has commercial payment result function EXECUTE privilege');
    console.log('RUNTIME COMMERCIAL PAYMENT RESULT EXECUTE DENIAL PASS');
    const providerSpecificPrivilege = (await runtime.query(`SELECT has_function_privilege(current_user, 'ghm.commercial_apply_payfast_payment_result(bigint,text,text,text,text,text,text,timestamptz,jsonb)', 'EXECUTE') AS execute_granted`)).rows[0];
    if (providerSpecificPrivilege.execute_granted) throw new Error('Runtime unexpectedly has PayFast-specific settlement EXECUTE privilege');
    const readPrivilege = (await runtime.query(`SELECT has_function_privilege(current_user, 'ghm.commercial_get_payfast_attempt(bigint)', 'EXECUTE') AS execute_granted`)).rows[0];
    if (readPrivilege.execute_granted) throw new Error('Runtime unexpectedly has PayFast attempt-read EXECUTE privilege');

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
        business_id, subscription_id, price_id, initiated_by, provider_code, attempt_status,
        amount_minor_units, currency_id, billing_interval, idempotency_key
      ) VALUES ($1, $2, $3, $4, 'payfast', 'pending_payment', 19900, $5, 'month', $6)
      RETURNING id
    `, [business.id, subscription.id, price.id, account.id, currency.id, `result-${Date.now()}`])).rows[0];
    const unboundAttempt = (await setup.query(`
      INSERT INTO ghm.commercial_payment_attempt (
        business_id, subscription_id, price_id, initiated_by, provider_code, attempt_status,
        amount_minor_units, currency_id, billing_interval, idempotency_key
      ) VALUES ($1, $2, $3, $4, NULL, 'pending_payment', 19900, $5, 'month', $6)
      RETURNING id
    `, [business.id, subscription.id, price.id, account.id, currency.id, `result-unbound-${Date.now()}`])).rows[0];
    fixture = { accountId:Number(account.id), businessId:Number(business.id), planId:Number(plan.id), versionId:Number(version.id), priceId:Number(price.id), subscriptionId:Number(subscription.id), attemptId:Number(attempt.id), unboundAttemptId:Number(unboundAttempt.id) };
    await setup.query('COMMIT');
  } catch (error) {
    await setup.query('ROLLBACK'); throw error;
  } finally { setup.release(); }

  const runtimeSettlement = await runtimePool.connect();
  try {
    await expectPermissionDenied(
      () => runtimeSettlement.query(`
        SELECT * FROM ghm.commercial_apply_payment_result(
          $1, 'payfast', 'qualification-runtime-forbidden', 'payment_complete',
          repeat('d', 64), 'payment', 'succeeded', 'FORBIDDEN', now(), '{"qualification":true}'::jsonb
        )
      `, [fixture.attemptId]),
      'RUNTIME SETTLEMENT EXECUTE DENIAL',
    );
  } finally { runtimeSettlement.release(); }

  const provider = await providerPool.connect();
  try {
    const identity = (await provider.query('SELECT session_user, current_user')).rows[0];
    if (identity.session_user !== 'ghm_payment_provider' || identity.current_user !== 'ghm_payment_provider') {
      throw new Error(`Unexpected provider identity: ${JSON.stringify(identity)}`);
    }
    const grants = (await provider.query(`
      SELECT
        has_function_privilege(current_user, 'ghm.commercial_apply_payfast_payment_result(bigint,text,text,text,text,text,text,timestamptz,jsonb)', 'EXECUTE') AS payfast_execute,
        has_function_privilege(current_user, 'ghm.commercial_apply_payment_result(bigint,text,text,text,text,text,text,text,timestamptz,jsonb)', 'EXECUTE') AS generic_execute,
        has_table_privilege(current_user, 'ghm.commercial_payment_attempt', 'SELECT') AS attempt_select,
        has_table_privilege(current_user, 'ghm.commercial_payment_transaction', 'INSERT') AS transaction_insert
    `)).rows[0];
    if (!grants.payfast_execute || grants.generic_execute || grants.attempt_select || grants.transaction_insert) {
      throw new Error(`Unexpected provider privilege set: ${JSON.stringify(grants)}`);
    }
    console.log('PROVIDER IDENTITY AND LEAST-PRIVILEGE MATRIX PASS');
    const directPrivileges = (await provider.query(`
      SELECT
        has_table_privilege(current_user, 'ghm.commercial_payment_attempt', 'SELECT') AS attempt_read,
        has_table_privilege(current_user, 'ghm.commercial_provider_event', 'SELECT') AS provider_event_read,
        has_table_privilege(current_user, 'ghm.commercial_payment_transaction', 'SELECT') AS transaction_read,
        has_table_privilege(current_user, 'ghm.commercial_subscription', 'SELECT') AS subscription_read,
        has_table_privilege(current_user, 'ghm.commercial_event', 'SELECT') AS commercial_event_read,
        has_table_privilege(current_user, 'ghm.commercial_founding_allocation', 'SELECT') AS founding_allocation_read,
        has_table_privilege(current_user, 'ghm.commercial_payment_attempt', 'UPDATE') AS attempt_update,
        has_table_privilege(current_user, 'ghm.commercial_subscription', 'UPDATE') AS subscription_update,
        has_table_privilege(current_user, 'ghm.commercial_provider_event', 'INSERT') AS provider_event_insert,
        has_table_privilege(current_user, 'ghm.commercial_event', 'INSERT') AS commercial_event_insert
    `)).rows[0];
    if (Object.values(directPrivileges).some(Boolean)) {
      throw new Error(`Provider role has unexpected direct commercial-table privileges: ${JSON.stringify(directPrivileges)}`);
    }
    console.log('PROVIDER ALL COMMERCIAL TABLE DIRECT PRIVILEGE DENIAL PASS');
    await expectPermissionDenied(() => provider.query('SELECT * FROM ghm.commercial_payment_attempt LIMIT 1'), 'PROVIDER DIRECT ATTEMPT READ DENIAL');
    await expectPermissionDenied(() => provider.query('SELECT * FROM ghm.commercial_provider_event LIMIT 1'), 'PROVIDER DIRECT EVENT READ DENIAL');
    await expectPermissionDenied(() => provider.query('UPDATE ghm.commercial_subscription SET lifecycle_status = lifecycle_status WHERE id = -1'), 'PROVIDER DIRECT SUBSCRIPTION UPDATE DENIAL');
    await expectPermissionDenied(() => provider.query('INSERT INTO ghm.commercial_event DEFAULT VALUES'), 'PROVIDER DIRECT COMMERCIAL EVENT INSERT DENIAL');
    await expectPermissionDenied(() => provider.query('INSERT INTO ghm.commercial_payment_transaction DEFAULT VALUES'), 'PROVIDER DIRECT TRANSACTION INSERT DENIAL');

    await provider.query('BEGIN');
    await provider.query('SAVEPOINT provider_mismatch_probe');
    let mismatchRejected = false;
    try {
      await provider.query(`
        SELECT * FROM ghm.commercial_apply_payfast_payment_result(
          $1, 'qualification-event-mismatch', 'payment_complete',
          repeat('c', 64), 'payment', 'succeeded', 'OTHER-1', now(), '{"qualification":true}'::jsonb
        )
      `, [fixture.unboundAttemptId]);
    } catch (error) {
      mismatchRejected = String(error?.message).includes('provider does not match attempt');
      await provider.query('ROLLBACK TO SAVEPOINT provider_mismatch_probe');
    }
    await provider.query('RELEASE SAVEPOINT provider_mismatch_probe');
    if (!mismatchRejected) throw new Error('Provider-specific SQL boundary did not reject a non-PayFast attempt');
    console.log('PROVIDER-SPECIFIC SQL PROVIDER BINDING PASS');

    const result = (await provider.query(`
      SELECT * FROM ghm.commercial_apply_payfast_payment_result(
        $1, 'qualification-event-1', 'payment_complete',
        repeat('b', 64), 'payment', 'succeeded', 'PF-QUAL-1', now(), '{"qualification":true}'::jsonb
      )
    `, [fixture.attemptId])).rows[0];
    if (!result?.id || result.transaction_status !== 'succeeded') throw new Error('PayFast settlement function did not create succeeded transaction');

    const duplicate = (await provider.query(`
      SELECT * FROM ghm.commercial_apply_payfast_payment_result(
        $1, 'qualification-event-1', 'payment_complete',
        repeat('b', 64), 'payment', 'succeeded', 'PF-QUAL-1', now(), '{"qualification":true}'::jsonb
      )
    `, [fixture.attemptId])).rows[0];
    if (Number(duplicate?.id) !== Number(result.id)) throw new Error('Identical provider event retry was not idempotent');

    await provider.query('SAVEPOINT terminal_attempt_probe');
    let terminalRejected = false;
    try {
      await provider.query(`
        SELECT * FROM ghm.commercial_apply_payfast_payment_result(
          $1, 'qualification-event-new-after-success', 'payment_complete',
          repeat('e', 64), 'payment', 'succeeded', 'PF-QUAL-2', now(), '{"qualification":true}'::jsonb
        )
      `, [fixture.attemptId]);
    } catch (error) {
      terminalRejected = String(error?.message).includes('commercial payment attempt is not payable');
      await provider.query('ROLLBACK TO SAVEPOINT terminal_attempt_probe');
    }
    await provider.query('RELEASE SAVEPOINT terminal_attempt_probe');
    if (!terminalRejected) throw new Error('New provider event unexpectedly settled a terminal attempt');
    console.log('PROVIDER EVENT IDEMPOTENCY AND TERMINAL ATTEMPT GUARD PASS');
    const state = (await provider.query('SELECT * FROM ghm.commercial_get_payfast_attempt($1)', [fixture.attemptId])).rows[0];
    if (state.attempt_status !== 'succeeded') throw new Error(`Payment attempt state was not advanced: ${state.attempt_status}`);
    if (state.subscription_status !== 'active') throw new Error(`Subscription state was not activated: ${state.subscription_status}`);
    console.log('DEDICATED PROVIDER SETTLEMENT PASS');
    await provider.query('ROLLBACK');
    console.log('PROVIDER SETTLEMENT ROLLBACK PASS');
  } finally { provider.release(); }
} finally {
  if (fixture) {
    const cleanup = await migratorPool.connect();
    try {
      await cleanup.query('SET ROLE ghm_schema_owner');
      await cleanup.query('BEGIN');
      await cleanup.query('DELETE FROM ghm.commercial_payment_attempt WHERE id = ANY($1::bigint[])', [[fixture.attemptId, fixture.unboundAttemptId]]);
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
  await runtimePool.end(); await migratorPool.end(); await providerPool.end();
}

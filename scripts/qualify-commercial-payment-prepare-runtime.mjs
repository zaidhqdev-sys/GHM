import { Pool } from 'pg';
import 'dotenv/config';
import { ConnectIdentityAdapterImpl } from '../dist/integrations/connect/identity-adapter.js';
import { PostgresAuthPersistence } from '../dist/auth/foundation/persistence.js';
import { PostgresAccountAuthStateStore } from '../dist/auth/ghm-bearer.js';
import { DefaultCommercialService } from '../dist/resources/commercial/service.js';
import { PostgresCommercialRepository } from '../dist/resources/commercial/repository.js';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl) throw new Error('Missing GHM runtime/migrator database URLs');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl });

const expectFailure = async (work, label, pattern) => {
  try { await work(); } catch (error) {
    if (!pattern.test(String(error?.message))) throw new Error(`${label}: unexpected error: ${error?.message}`);
    console.log(`${label}: PASS`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

let fixture = null;
try {
  const identity = (await runtimePool.query('SELECT current_database(), session_user, current_user, current_role')).rows[0];
  if (identity.current_database !== 'ghm_db' || identity.session_user !== 'ghm_runtime' || identity.current_user !== 'ghm_runtime' || identity.current_role !== 'ghm_runtime') {
    throw new Error(`Unexpected runtime identity: ${JSON.stringify(identity)}`);
  }
  console.log('COMMERCIAL PAYMENT PREPARE RUNTIME IDENTITY PASS');

  const setup = await migratorPool.connect();
  try {
    await setup.query('SET ROLE ghm_schema_owner');
    await setup.query('BEGIN');

    const owner = (await setup.query(`
      INSERT INTO ghm.account_identity (full_name, role, account_status)
      VALUES ('Commercial Prepare Qualification Owner', 'business', 'active')
      RETURNING id
    `)).rows[0];
    const outsider = (await setup.query(`
      INSERT INTO ghm.account_identity (full_name, role, account_status)
      VALUES ('Commercial Prepare Qualification Outsider', 'business', 'active')
      RETURNING id
    `)).rows[0];

    const ownerSubject = crypto.randomUUID();
    const outsiderSubject = crypto.randomUUID();
    await setup.query(`
      INSERT INTO ghm.account_external_identity (provider, subject, account_id)
      VALUES ('supabase', $1, $2), ('supabase', $3, $4)
    `, [ownerSubject, owner.id, outsiderSubject, outsider.id]);

    const business = (await setup.query(`
      INSERT INTO ghm.business (name, slug, verification_status, is_verified)
      VALUES ('Commercial Prepare Qualification', $1, 'approved', true)
      RETURNING id
    `, [`commercial-prepare-${Date.now()}`])).rows[0];

    await setup.query(`
      INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
      VALUES ($1, $2, 'owner', 'active', $2)
    `, [business.id, owner.id]);

    const plan = (await setup.query(`
      INSERT INTO ghm.commercial_plan (code, name, lifecycle_status)
      VALUES ($1, 'Commercial Prepare Qualification', 'active')
      RETURNING id
    `, [`commercial_prepare_${Date.now()}`])).rows[0];

    const now = new Date();
    const version = (await setup.query(`
      INSERT INTO ghm.commercial_plan_version (plan_id, version, trial_days, effective_from, lifecycle_status)
      VALUES ($1, 1, 0, $2, 'active')
      RETURNING id
    `, [plan.id, now])).rows[0];

    const currency = (await setup.query(`SELECT id FROM ghm.currency WHERE code = 'ZAR' AND is_active = true LIMIT 1`)).rows[0];
    if (!currency) throw new Error('Expected canonical ZAR currency');

    const price = (await setup.query(`
      INSERT INTO ghm.commercial_plan_price (
        plan_version_id, currency_id, price_kind, amount_minor_units,
        billing_interval, effective_from, lifecycle_status
      )
      VALUES ($1, $2, 'standard', 19900, 'month', $3, 'active')
      RETURNING id
    `, [version.id, currency.id, now])).rows[0];

    const subscription = (await setup.query(`
      INSERT INTO ghm.commercial_subscription (business_id, plan_version_id, price_id, lifecycle_status)
      VALUES ($1, $2, $3, 'active')
      RETURNING id
    `, [business.id, version.id, price.id])).rows[0];

    fixture = {
      ownerId: Number(owner.id),
      outsiderId: Number(outsider.id),
      ownerSubject,
      outsiderSubject,
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

  const identityAdapter = new ConnectIdentityAdapterImpl(new PostgresAuthPersistence(runtimePool));
  const accountStateStore = new PostgresAccountAuthStateStore(runtimePool);
  const service = new DefaultCommercialService(new PostgresCommercialRepository(runtimePool));

  const ownerResolution = await identityAdapter.resolve(fixture.ownerSubject, { allowBootstrap: false });
  if (ownerResolution.outcome !== 'resolved' || ownerResolution.mapping?.accountId !== fixture.ownerId) {
    throw new Error(`Unexpected owner identity resolution: ${JSON.stringify(ownerResolution)}`);
  }
  console.log('CONNECT EXTERNAL IDENTITY RESOLUTION PASS');

  const ownerState = await accountStateStore.getAccountAuthState(fixture.ownerId);
  if (!ownerState || ownerState.accountStatus !== 'active' || ownerState.role !== 'business') {
    throw new Error(`Unexpected owner auth state: ${JSON.stringify(ownerState)}`);
  }
  console.log('CANONICAL ACCOUNT AUTH STATE PASS');

  const key = `commercial-prepare-qualification-${Date.now()}`;
  const prepared = await service.prepareCommercialPayment(
    { userId: ownerState.accountId, role: ownerState.role },
    { businessId: fixture.businessId, idempotencyKey: key, expiresAt: null },
  );
  if (prepared.businessId !== fixture.businessId || prepared.initiatedByAccountId !== fixture.ownerId || prepared.lifecycleStatus !== 'pending_checkout') {
    throw new Error(`Unexpected prepared payment attempt: ${JSON.stringify(prepared)}`);
  }
  console.log('COMMERCIAL PAYMENT PREPARE AUTHORIZED PASS');

  const outsiderResolution = await identityAdapter.resolve(fixture.outsiderSubject, { allowBootstrap: false });
  if (outsiderResolution.outcome !== 'resolved' || outsiderResolution.mapping?.accountId !== fixture.outsiderId) {
    throw new Error('Outsider identity resolution did not resolve canonically');
  }
  const outsiderState = await accountStateStore.getAccountAuthState(fixture.outsiderId);
  if (!outsiderState || outsiderState.accountStatus !== 'active') throw new Error('Outsider auth state did not resolve');
  await expectFailure(
    () => service.prepareCommercialPayment(
      { userId: outsiderState.accountId, role: outsiderState.role },
      { businessId: fixture.businessId, idempotencyKey: `outsider-${Date.now()}`, expiresAt: null },
    ),
    'UNAUTHORIZED BUSINESS ACTOR DENIAL',
    /Business management permission required/i,
  );

  const unmappedSubject = crypto.randomUUID();
  const unmapped = await identityAdapter.resolve(unmappedSubject, { allowBootstrap: false });
  if (unmapped.outcome !== 'unmapped' || unmapped.mapping !== null) throw new Error('Unmapped identity did not fail closed');
  console.log('UNMAPPED CONNECT IDENTITY FAIL-CLOSED PASS');

  const preparedAgain = await service.prepareCommercialPayment(
    { userId: ownerState.accountId, role: ownerState.role },
    { businessId: fixture.businessId, idempotencyKey: key, expiresAt: null },
  );
  if (preparedAgain.id !== prepared.id) throw new Error('Payment preparation idempotency did not return the original attempt');
  console.log('COMMERCIAL PAYMENT PREPARE IDEMPOTENCY PASS');
} finally {
  if (fixture) {
    const cleanup = await migratorPool.connect();
    try {
      await cleanup.query('SET ROLE ghm_schema_owner');
      await cleanup.query('BEGIN');
      await cleanup.query('DELETE FROM ghm.commercial_payment_attempt WHERE business_id = $1', [fixture.businessId]);
      await cleanup.query('DELETE FROM ghm.commercial_event WHERE subscription_id = $1', [fixture.subscriptionId]);
      await cleanup.query('DELETE FROM ghm.commercial_subscription WHERE id = $1', [fixture.subscriptionId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan_price WHERE id = $1', [fixture.priceId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan_version WHERE id = $1', [fixture.versionId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan WHERE id = $1', [fixture.planId]);
      await cleanup.query('DELETE FROM ghm.business_membership WHERE business_id = $1', [fixture.businessId]);
      await cleanup.query('DELETE FROM ghm.business WHERE id = $1', [fixture.businessId]);
      await cleanup.query('DELETE FROM ghm.account_external_identity WHERE account_id IN ($1, $2)', [fixture.ownerId, fixture.outsiderId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id IN ($1, $2)', [fixture.ownerId, fixture.outsiderId]);
      await cleanup.query('COMMIT');
    } catch (error) {
      await cleanup.query('ROLLBACK');
      throw error;
    } finally { cleanup.release(); }
  }
  await runtimePool.end();
  await migratorPool.end();
}

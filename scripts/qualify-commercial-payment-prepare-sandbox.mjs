import { Pool } from 'pg';
import 'dotenv/config';

const SANDBOX_DATABASE = 'ghm_payfast_sandbox_db';
const FOUNDER_SUBJECT = 'd31a5c89-b74a-4966-b3e4-11b66be858ec';
const CONNECT_BUSINESS_ID = '01ce0937-e659-442d-a66a-a49b38d81d63';
const EXPECTED_BUSINESS_ID = 2;
const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl) throw new Error('Sandbox runtime and migrator database URLs are required');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

// This qualification script does not start the HTTP server or issue invitations.
// Provide harmless local-only config defaults before dynamically importing modules
// that load the shared application config. Never overwrite supplied environment values.
process.env.DATABASE_URL = runtimeUrl;
process.env.DATABASE_SSL = 'true';
process.env.PAYFAST_ENVIRONMENT = 'sandbox';
process.env.INVITE_CODE ??= 'sandbox-qualification-not-used';
process.env.CORS_ORIGINS ??= 'https://zaidtechnologies.co.za';

const [
  { ConnectIdentityAdapterImpl },
  { PostgresAuthPersistence },
  { PostgresAccountAuthStateStore },
  { DefaultCommercialService },
  { PostgresCommercialRepository },
] = await Promise.all([
  import('../dist/integrations/connect/identity-adapter.js'),
  import('../dist/auth/foundation/persistence.js'),
  import('../dist/auth/ghm-bearer.js'),
  import('../dist/resources/commercial/service.js'),
  import('../dist/resources/commercial/repository.js'),
]);

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl });
const expectFailure = async (work, label, pattern) => {
  try {
    await work();
  } catch (error) {
    if (!pattern.test(String(error?.message))) throw new Error(`${label}: unexpected error: ${error?.message}`);
    console.log(`${label}: PASS`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

let fixture = null;
let setupCommitted = false;
try {
  const runtimeIdentity = (await runtimePool.query(
    'SELECT current_database(), session_user, current_user, current_role',
  )).rows[0];
  if (runtimeIdentity.current_database !== SANDBOX_DATABASE ||
      runtimeIdentity.session_user !== 'ghm_runtime' ||
      runtimeIdentity.current_user !== 'ghm_runtime' ||
      runtimeIdentity.current_role !== 'ghm_runtime') {
    throw new Error(`Refusing to use runtime connection outside sandbox/runtime role: ${JSON.stringify(runtimeIdentity)}`);
  }
  const migratorIdentity = (await migratorPool.query(
    'SELECT current_database(), session_user, current_user, current_role',
  )).rows[0];
  if (migratorIdentity.current_database !== SANDBOX_DATABASE ||
      migratorIdentity.session_user !== 'ghm_migrator' ||
      migratorIdentity.current_user !== 'ghm_migrator') {
    throw new Error(`Refusing to use migrator connection outside sandbox/migrator role: ${JSON.stringify(migratorIdentity)}`);
  }
  console.log('SANDBOX DATABASE AND LEAST-PRIVILEGE ROLE GUARDS PASS');

  const businessLookup = await runtimePool.query(
    'SELECT * FROM ghm.auth_lookup_business_external_mapping($1, $2)',
    ['supabase', CONNECT_BUSINESS_ID],
  );
  if (businessLookup.rowCount !== 1 || Number(businessLookup.rows[0].business_id) !== EXPECTED_BUSINESS_ID) {
    throw new Error('Canonical Connect business mapping did not resolve to the expected sandbox business');
  }
  const identityAdapter = new ConnectIdentityAdapterImpl(new PostgresAuthPersistence(runtimePool));
  const founder = await identityAdapter.resolve(FOUNDER_SUBJECT, { allowBootstrap: false });
  if (founder.outcome !== 'resolved' || founder.mapping?.accountId !== 1) {
    throw new Error('Canonical founder identity did not resolve to sandbox account 1');
  }
  const accountStateStore = new PostgresAccountAuthStateStore(runtimePool);
  const founderState = await accountStateStore.getAccountAuthState(1);
  if (!founderState || founderState.accountStatus !== 'active') {
    throw new Error('Mapped founder account is not active');
  }
  const membership = await runtimePool.query(
    `SELECT membership_role, membership_status
       FROM ghm.business_membership
      WHERE business_id = $1 AND account_id = $2`,
    [EXPECTED_BUSINESS_ID, 1],
  );
  if (membership.rowCount !== 1 || membership.rows[0].membership_role !== 'owner' ||
      membership.rows[0].membership_status !== 'active') {
    throw new Error('Founder does not have the expected active owner membership in sandbox');
  }
  console.log('CANONICAL FOUNDER, BUSINESS MAPPING, AND OWNER AUTHORIZATION PASS');

  const setup = await migratorPool.connect();
  try {
    await setup.query('BEGIN');
    await setup.query('SET LOCAL ROLE ghm_schema_owner');
    const existingSubscription = await setup.query(
      `SELECT id FROM ghm.commercial_subscription
        WHERE business_id = $1
          AND lifecycle_status IN ('trialing','active','past_due','grace_period','cancel_at_period_end','suspended')
        LIMIT 1`,
      [EXPECTED_BUSINESS_ID],
    );
    if (existingSubscription.rowCount !== 0) {
      throw new Error('Sandbox business already has a current subscription; refusing to alter existing commercial state');
    }
    const business = await setup.query(
      'SELECT id, verification_status, is_verified FROM ghm.business WHERE id = $1',
      [EXPECTED_BUSINESS_ID],
    );
    if (business.rowCount !== 1 || business.rows[0].verification_status !== 'unverified' ||
        business.rows[0].is_verified !== false) {
      throw new Error('Sandbox business verification state differs from expected unverified state; refusing to continue');
    }

    const suffix = `${Date.now()}_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const outsider = (await setup.query(
      `INSERT INTO ghm.account_identity (full_name, role, account_status)
       VALUES ('Sandbox Payment Prepare Outsider', 'customer', 'active')
       RETURNING id`,
    )).rows[0];
    const outsiderSubject = crypto.randomUUID();
    await setup.query(
      `INSERT INTO ghm.account_external_identity (provider, subject, account_id)
       VALUES ('supabase', $1, $2)`,
      [outsiderSubject, outsider.id],
    );

    const plan = (await setup.query(
      `INSERT INTO ghm.commercial_plan (code, name, lifecycle_status)
       VALUES ($1, 'Sandbox Payment Prepare Qualification', 'active')
       RETURNING id`,
      [`sandbox_payment_prepare_${suffix}`],
    )).rows[0];
    const now = new Date();
    const version = (await setup.query(
      `INSERT INTO ghm.commercial_plan_version
         (plan_id, version, trial_days, effective_from, lifecycle_status)
       VALUES ($1, 1, 0, $2, 'active')
       RETURNING id`,
      [plan.id, now],
    )).rows[0];
    const currency = (await setup.query(
      `SELECT id FROM ghm.currency WHERE code = 'ZAR' AND is_active = true LIMIT 1`,
    )).rows[0];
    if (!currency) throw new Error('Canonical active ZAR currency is missing in sandbox');
    const price = (await setup.query(
      `INSERT INTO ghm.commercial_plan_price
         (plan_version_id, currency_id, price_kind, amount_minor_units, billing_interval, effective_from, lifecycle_status)
       VALUES ($1, $2, 'standard', 19900, 'month', $3, 'active')
       RETURNING id`,
      [version.id, currency.id, now],
    )).rows[0];
    const subscription = (await setup.query(
      `INSERT INTO ghm.commercial_subscription
         (business_id, plan_version_id, price_id, lifecycle_status)
       VALUES ($1, $2, $3, 'active')
       RETURNING id`,
      [EXPECTED_BUSINESS_ID, version.id, price.id],
    )).rows[0];

    fixture = {
      outsiderId: Number(outsider.id),
      outsiderSubject,
      planId: Number(plan.id),
      versionId: Number(version.id),
      priceId: Number(price.id),
      subscriptionId: Number(subscription.id),
    };
    await setup.query('COMMIT');
    setupCommitted = true;
  } catch (error) {
    await setup.query('ROLLBACK');
    throw error;
  } finally {
    setup.release();
  }
  console.log('ISOLATED SANDBOX COMMERCIAL FIXTURE CREATED; BUSINESS VERIFICATION UNCHANGED');

  const service = new DefaultCommercialService(new PostgresCommercialRepository(runtimePool));
  const idempotencyKey = `sandbox-payment-prepare-${crypto.randomUUID()}`;
  fixture.idempotencyKey = idempotencyKey;
  const prepared = await service.prepareCommercialPayment(
    { userId: founderState.accountId, role: founderState.role },
    { businessId: EXPECTED_BUSINESS_ID, countryId: null, idempotencyKey, expiresAt: null },
  );
  if (prepared.businessId !== EXPECTED_BUSINESS_ID || prepared.initiatedByAccountId !== 1 ||
      prepared.lifecycleStatus !== 'pending_checkout' || prepared.amountMinorUnits !== 19900) {
    throw new Error('Authorized payment preparation returned an unexpected attempt');
  }
  console.log('AUTHORIZED COMMERCIAL PAYMENT PREPARATION PASS');

  const preparedAgain = await service.prepareCommercialPayment(
    { userId: founderState.accountId, role: founderState.role },
    { businessId: EXPECTED_BUSINESS_ID, countryId: null, idempotencyKey, expiresAt: null },
  );
  if (preparedAgain.id !== prepared.id) throw new Error('Retry did not return the original payment attempt');
  console.log('PAYMENT PREPARATION IDEMPOTENCY PASS');

  const outsider = await identityAdapter.resolve(fixture.outsiderSubject, { allowBootstrap: false });
  if (outsider.outcome !== 'resolved' || outsider.mapping?.accountId !== fixture.outsiderId) {
    throw new Error('Sandbox outsider identity did not resolve canonically');
  }
  const outsiderState = await accountStateStore.getAccountAuthState(fixture.outsiderId);
  if (!outsiderState || outsiderState.accountStatus !== 'active') throw new Error('Sandbox outsider account is not active');
  await expectFailure(
    () => service.prepareCommercialPayment(
      { userId: outsiderState.accountId, role: outsiderState.role },
      { businessId: EXPECTED_BUSINESS_ID, countryId: null, idempotencyKey: `outsider-${crypto.randomUUID()}`, expiresAt: null },
    ),
    'UNAUTHORIZED BUSINESS ACTOR DENIAL',
    /Business management permission required/i,
  );

  const unmapped = await identityAdapter.resolve(crypto.randomUUID(), { allowBootstrap: false });
  if (unmapped.outcome !== 'unmapped' || unmapped.mapping !== null) {
    throw new Error('Unmapped external identity did not fail closed');
  }
  console.log('UNMAPPED CONNECT IDENTITY FAIL-CLOSED PASS');
  console.log(JSON.stringify({
    status: 'SANDBOX_COMMERCIAL_PAYMENT_PREPARATION_SERVICE_PASSED',
    database: SANDBOX_DATABASE,
    founderAccountId: 1,
    businessId: EXPECTED_BUSINESS_ID,
    paymentAttemptId: prepared.id,
    amountMinorUnits: prepared.amountMinorUnits,
    currencyId: prepared.currencyId,
    paymentAttemptStatus: prepared.lifecycleStatus,
    productionTouched: false,
    livePaymentsEnabled: false,
    businessVerificationChanged: false,
    httpAssertionRouteExercised: false,
  }, null, 2));
} finally {
  if (fixture && setupCommitted) {
    const cleanup = await migratorPool.connect();
    try {
      await cleanup.query('BEGIN');
      await cleanup.query('SET LOCAL ROLE ghm_schema_owner');
      await cleanup.query('DELETE FROM ghm.commercial_payment_attempt WHERE business_id = $1 AND initiated_by = 1 AND idempotency_key = $2', [EXPECTED_BUSINESS_ID, fixture.idempotencyKey]);
      await cleanup.query('DELETE FROM ghm.commercial_event WHERE subscription_id = $1', [fixture.subscriptionId]);
      await cleanup.query('DELETE FROM ghm.commercial_subscription WHERE id = $1', [fixture.subscriptionId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan_price WHERE id = $1', [fixture.priceId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan_version WHERE id = $1', [fixture.versionId]);
      await cleanup.query('DELETE FROM ghm.commercial_plan WHERE id = $1', [fixture.planId]);
      await cleanup.query('DELETE FROM ghm.account_external_identity WHERE account_id = $1', [fixture.outsiderId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id = $1', [fixture.outsiderId]);
      await cleanup.query('COMMIT');
      console.log('SANDBOX QUALIFICATION FIXTURE CLEANUP PASS');
    } catch (error) {
      await cleanup.query('ROLLBACK');
      console.error('SANDBOX QUALIFICATION FIXTURE CLEANUP FAILED; inspect sandbox only before rerunning');
      throw error;
    } finally {
      cleanup.release();
    }
  }
  await runtimePool.end();
  await migratorPool.end();
}

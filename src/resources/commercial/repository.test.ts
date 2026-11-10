import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';
import type { CommercialAccess, CommercialSubscription } from './contracts';
import { PostgresCommercialRepository } from './repository';

const businessId = 11;
const userId = 7;
const context = (role: AuthContext['role'] = 'business'): AuthContext => ({ userId, role });

const subscriptionRow = {
  id: 21, business_id: businessId, plan_version_id: 31, price_id: 41, trial_id: null,
  lifecycle_status: 'active', current_period_start: new Date(1000), current_period_end: new Date(2000),
  cancel_at_period_end: false, cancelled_at: null, founding_sequence: null, founding_protected_until: null,
  provider_reference: null, created_at: new Date(0), updated_at: new Date(0),
};

const entitlementRows = [{ entitlement_code: 'quote_management', access_level: 'enabled', metadata: { source: 'commercial-plan-version' } }];

const createFakePool = (options: {
  membership?: boolean;
  management?: boolean;
  subscriptionRow?: Record<string, unknown> | null;
  entitlementRows?: Record<string, unknown>[];
  planRow?: Record<string, unknown> | null;
  activatedAt?: Date;
  trialRow?: Record<string, unknown>;
  subscriptionId?: number;
  failEvent?: boolean;
  offerRow?: Record<string, unknown> | null;
  evaluatedAt?: Date;
} = {}): { pool: TransactionPool; calls: string[]; params: unknown[][] } => {
  const calls: string[] = [];
  const params: unknown[][] = [];
  const client = {
    async query(sql: string, queryParams?: unknown[]): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> {
      calls.push(sql);
      params.push(queryParams ?? []);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql === 'SELECT now() AS activated_at') return { rowCount: 1, rows: [{ activated_at: options.activatedAt ?? new Date(1000) }] };
      if (sql === 'SELECT now() AS evaluated_at') return { rowCount: 1, rows: [{ evaluated_at: options.evaluatedAt ?? new Date(1500) }] };
      if (sql.includes('FROM ghm.business_membership') && sql.includes("membership_role IN ('owner', 'administrator')")) {
        return { rowCount: options.management === false ? 0 : 1, rows: [] };
      }
      if (sql.includes('FROM ghm.business_membership') && sql.includes("membership_status = 'active'")) {
        return { rowCount: options.membership === false ? 0 : 1, rows: [] };
      }
      if (sql.includes('FROM ghm.commercial_plan plan')) {
        return { rowCount: options.offerRow ? 1 : 0, rows: options.offerRow ? [options.offerRow] : [] };
      }
      if (sql.includes('FROM ghm.commercial_subscription')) {
        const row = options.subscriptionRow === undefined ? subscriptionRow : options.subscriptionRow;
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (sql.includes('FROM ghm.commercial_plan_entitlement')) {
        const rows = options.entitlementRows ?? entitlementRows;
        return { rowCount: rows.length, rows };
      }
      if (sql.includes('FROM ghm.commercial_plan_version AS version_row')) {
        return { rowCount: options.planRow ? 1 : 0, rows: options.planRow ? [options.planRow] : [] };
      }
      if (sql.includes('INSERT INTO ghm.commercial_trial')) {
        return {
          rowCount: 1,
          rows: [options.trialRow ?? {
            id: 51, business_id: businessId, plan_version_id: 31, activated_by: userId,
            activated_at: new Date(1000), expires_at: new Date(1000 + 7 * 86400000), lifecycle_status: 'active',
            ended_at: null, created_at: new Date(1000), updated_at: new Date(1000),
          }],
        };
      }
      if (sql.includes('INSERT INTO ghm.commercial_subscription')) return { rowCount: 1, rows: [{ id: options.subscriptionId ?? 61 }] };
      if (sql.includes('INSERT INTO ghm.commercial_event')) {
        if (options.failEvent) throw new Error('event failure');
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    },
    release(): void {},
  };
  return {
    pool: { async connect(): Promise<PoolClient> { return client as unknown as PoolClient; } },
    calls,
    params,
  };
};

test('Commercial access read allows active Business membership', async () => {
  const { pool } = createFakePool();
  const result = await new PostgresCommercialRepository(pool).getCommercialAccess(context(), businessId);
  assert.equal(result.businessId, businessId);
  assert.equal(result.subscriptionId, 21);
  assert.equal(result.status, 'active');
  assert.deepEqual(result.entitlements, [{ code: 'quote_management', accessLevel: 'enabled', metadata: { source: 'commercial-plan-version' } }]);
});

test('Commercial access with an expired billing or trial period does not expose entitlements', async () => {
  const { pool, calls } = createFakePool({
    subscriptionRow: { ...subscriptionRow, current_period_end: new Date(1499) },
    evaluatedAt: new Date(1500),
  });
  const result = await new PostgresCommercialRepository(pool).getCommercialAccess(context(), businessId);
  assert.equal(result.status, 'active');
  assert.deepEqual(result.entitlements, []);
  assert.equal(calls.some(sql => sql.includes('FROM ghm.commercial_plan_entitlement')), false);
});

test('Commercial access before the subscription period starts does not expose entitlements', async () => {
  const { pool, calls } = createFakePool({
    subscriptionRow: { ...subscriptionRow, current_period_start: new Date(1501) },
    evaluatedAt: new Date(1500),
  });
  const result = await new PostgresCommercialRepository(pool).getCommercialAccess(context(), businessId);
  assert.deepEqual(result.entitlements, []);
  assert.equal(calls.some(sql => sql.includes('FROM ghm.commercial_plan_entitlement')), false);
});

test('Commercial access fails closed when subscription period bounds are missing', async () => {
  const { pool, calls } = createFakePool({
    subscriptionRow: { ...subscriptionRow, current_period_end: null },
    evaluatedAt: new Date(1500),
  });
  const result = await new PostgresCommercialRepository(pool).getCommercialAccess(context(), businessId);
  assert.deepEqual(result.entitlements, []);
  assert.equal(calls.some(sql => sql.includes('FROM ghm.commercial_plan_entitlement')), false);
});

test('Commercial access read rejects inactive or revoked membership', async () => {
  const { pool, calls } = createFakePool({ membership: false });
  await assert.rejects(() => new PostgresCommercialRepository(pool).getCommercialAccess(context(), businessId), /Business read permission required/);
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.commercial_subscription')), false);
});

test('Commercial access read rejects invalid Business ID before transaction', async () => {
  let connected = false;
  const pool: TransactionPool = { async connect(): Promise<PoolClient> { connected = true; throw new Error('transaction should not be opened'); } };
  await assert.rejects(() => new PostgresCommercialRepository(pool).getCommercialAccess(context(), 0), /businessId must be a positive integer/);
  assert.equal(connected, false);
});

test('Commercial access returns basic without a current subscription', async () => {
  const { pool } = createFakePool({ subscriptionRow: null });
  const result = await new PostgresCommercialRepository(pool).getCommercialAccess(context(), businessId);
  const expected: CommercialAccess = { businessId, subscriptionId: null, status: 'basic', currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, foundingProtectedUntil: null, entitlements: [], evaluatedAt: result.evaluatedAt };
  assert.deepEqual(result, expected);
});

test('Commercial access with past_due does not expose entitlements', async () => {
  const { pool, calls } = createFakePool({ subscriptionRow: { ...subscriptionRow, lifecycle_status: 'past_due' } });
  const result = await new PostgresCommercialRepository(pool).getCommercialAccess(context(), businessId);
  assert.equal(result.status, 'past_due');
  assert.deepEqual(result.entitlements, []);
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.commercial_plan_entitlement')), false);
});

test('Commercial subscription read returns current subscription', async () => {
  const { pool } = createFakePool({ subscriptionRow: { ...subscriptionRow, lifecycle_status: 'past_due' } });
  const result = await new PostgresCommercialRepository(pool).getCommercialSubscription(context(), businessId);
  assert.deepEqual(result, {
    id: 21, businessId, planVersionId: 31, priceId: 41, trialId: null, lifecycleStatus: 'past_due',
    currentPeriodStart: new Date(1000), currentPeriodEnd: new Date(2000), cancelAtPeriodEnd: false,
    cancelledAt: null, foundingSequence: null, foundingProtectedUntil: null, providerReference: null,
    createdAt: new Date(0), updatedAt: new Date(0),
  } satisfies CommercialSubscription);
});

test('Commercial subscription read requires owner or administrator membership', async () => {
  const { pool, calls } = createFakePool({ management: false });
  await assert.rejects(() => new PostgresCommercialRepository(pool).getCommercialSubscription(context(), businessId), /Business management permission required/);
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.commercial_subscription')), false);
});

test('Commercial trial activation requires an explicit plan code', async () => {
  const { pool } = createFakePool();
  await assert.rejects(() => new PostgresCommercialRepository(pool).activateCommercialTrial(context(), { businessId, planCode: '   ' }), /planCode is required/);
});

test('Commercial trial activation rejects non-management membership', async () => {
  const { pool, calls } = createFakePool({ management: false });
  await assert.rejects(() => new PostgresCommercialRepository(pool).activateCommercialTrial(context(), { businessId, planCode: 'business_pro' }), /Business management permission required/);
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.commercial_plan_version AS version_row')), false);
});

test('Commercial trial activation selects the highest eligible plan version and creates atomic trial state', async () => {
  const activatedAt = new Date('2026-09-15T20:00:00.000Z');
  const { pool, calls, params } = createFakePool({
    planRow: { id: 31, trial_days: 14 },
    activatedAt,
    trialRow: {
      id: 51, business_id: businessId, plan_version_id: 31, activated_by: userId,
      activated_at: activatedAt, expires_at: new Date(activatedAt.getTime() + 14 * 86400000),
      lifecycle_status: 'active', ended_at: null, created_at: activatedAt, updated_at: activatedAt,
    },
    subscriptionId: 61,
  });
  const result = await new PostgresCommercialRepository(pool).activateCommercialTrial(context(), { businessId, planCode: 'business_pro' });
  assert.equal(result.id, 51);
  assert.equal(result.planVersionId, 31);
  assert.equal(result.activatedByAccountId, userId);
  assert.equal(result.expiresAt.getTime(), activatedAt.getTime() + 14 * 86400000);
  const planSql = calls.find((sql) => sql.includes('FROM ghm.commercial_plan_version AS version_row'));
  assert.ok(planSql);
  assert.match(planSql, /plan\.code = \$1/);
  assert.match(planSql, /version_row\.trial_days > 0/);
  assert.match(planSql, /ORDER BY version_row\.version DESC/);
  assert.deepEqual(params[calls.indexOf(planSql)], ['business_pro', activatedAt]);
  assert.equal(calls.filter((sql) => sql.includes('INSERT INTO ghm.commercial_trial')).length, 1);
  assert.equal(calls.filter((sql) => sql.includes('INSERT INTO ghm.commercial_subscription')).length, 1);
  assert.equal(calls.filter((sql) => sql.includes('INSERT INTO ghm.commercial_event')).length, 1);
  assert.equal(calls[0], 'BEGIN');
  assert.equal(calls.at(-1), 'COMMIT');
});

test('Commercial trial activation rejects when no eligible plan exists', async () => {
  const { pool } = createFakePool({ planRow: null });
  await assert.rejects(() => new PostgresCommercialRepository(pool).activateCommercialTrial(context(), { businessId, planCode: 'missing_plan' }), /Eligible commercial plan not found/);
});

test('Commercial trial activation rolls back when a later write fails', async () => {
  const activatedAt = new Date(1000);
  const { pool } = createFakePool({ planRow: { id: 31, trial_days: 7 }, activatedAt, failEvent: true });
  await assert.rejects(() => new PostgresCommercialRepository(pool).activateCommercialTrial(context(), { businessId, planCode: 'business_pro' }), /event failure/);
});


test('Commercial payment preparation requires management membership before payment reads', async () => {
  const { pool, calls } = createFakePool({ management: false });
  await assert.rejects(
    () => new PostgresCommercialRepository(pool).prepareCommercialPayment(
      context(),
      { businessId, idempotencyKey: 'idem-key-123' },
    ),
    /Business management permission required/,
  );
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.commercial_payment_attempt')), false);
});

test('Commercial payment preparation rejects invalid idempotency keys before opening a transaction', async () => {
  let connected = false;
  const pool: TransactionPool = {
    async connect(): Promise<PoolClient> {
      connected = true;
      throw new Error('transaction should not be opened');
    },
  };
  await assert.rejects(
    () => new PostgresCommercialRepository(pool).prepareCommercialPayment(
      context(),
      { businessId, idempotencyKey: 'short' },
    ),
    /idempotencyKey must be between 8 and 200 characters/,
  );
  assert.equal(connected, false);
});

test('Commercial payment preparation rejects idempotency reuse by another actor', async () => {
  const existing = {
    id: 71, business_id: businessId, subscription_id: 21, price_id: 41, initiated_by: 8, provider_code: 'payfast',
    attempt_status: 'pending_checkout', amount_minor_units: 19900, currency_id: 1,
    billing_interval: 'month', idempotency_key: 'idem-key-123', checkout_reference: null,
    expires_at: null, failure_code: null, failure_message: null,
    created_at: new Date(1000), updated_at: new Date(1000),
  };
  const client = {
    async query(sql: string): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.includes('FROM ghm.business_membership')) return { rowCount: 1, rows: [] };
      if (sql.includes('FROM ghm.commercial_payment_attempt')) return { rowCount: 1, rows: [existing] };
      throw new Error(`Unexpected SQL in conflict test: ${sql}`);
    },
    release(): void {},
  };
  const pool: TransactionPool = { async connect(): Promise<PoolClient> { return client as unknown as PoolClient; } };
  await assert.rejects(
    () => new PostgresCommercialRepository(pool).prepareCommercialPayment(
      context(),
      { businessId, idempotencyKey: 'idem-key-123' },
    ),
    /Payment preparation idempotency conflict/,
  );
});

test('Commercial payment preparation resolves price and persists a PayFast-bound attempt atomically', async () => {
  const preparedAt = new Date('2026-10-03T10:00:00.000Z');
  const calls: string[] = [];
  const params: unknown[][] = [];
  const client = {
    async query(sql: string, queryParams?: unknown[]): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> {
      calls.push(sql);
      params.push(queryParams ?? []);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.includes('FROM ghm.business_membership')) return { rowCount: 1, rows: [] };
      if (sql.includes('FROM ghm.commercial_payment_attempt')) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM ghm.commercial_subscription')) return { rowCount: 1, rows: [subscriptionRow] };
      if (sql === 'SELECT now() AS prepared_at') return { rowCount: 1, rows: [{ prepared_at: preparedAt }] };
      if (sql.includes('FROM ghm.commercial_plan_price')) {
        return { rowCount: 1, rows: [{ id: 41, amount_minor_units: 19900, currency_id: 1, billing_interval: 'month' }] };
      }
      if (sql.includes('INSERT INTO ghm.commercial_payment_attempt')) {
        return { rowCount: 1, rows: [{
          id: 71, business_id: businessId, subscription_id: 21, price_id: 41, initiated_by: userId, provider_code: 'payfast',
          attempt_status: 'pending_checkout', amount_minor_units: 19900, currency_id: 1,
          billing_interval: 'month', idempotency_key: 'idem-key-123', checkout_reference: null,
          expires_at: new Date(preparedAt.getTime() + 15 * 60000), failure_code: null, failure_message: null,
          created_at: preparedAt, updated_at: preparedAt,
        }] };
      }
      if (sql.includes('INSERT INTO ghm.commercial_event')) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected SQL in payment preparation test: ${sql}`);
    },
    release(): void {},
  };
  const pool: TransactionPool = { async connect(): Promise<PoolClient> { return client as unknown as PoolClient; } };
  const result = await new PostgresCommercialRepository(pool).prepareCommercialPayment(
    context(),
    {
      businessId,
      countryId: 1,
      idempotencyKey: 'idem-key-123',
      expiresAt: new Date(preparedAt.getTime() + 15 * 60000),
    },
  );
  assert.equal(result.id, 71);
  assert.equal(result.lifecycleStatus, 'pending_checkout');
  assert.equal(result.providerCode, 'payfast');
  assert.equal(result.priceId, 41);
  assert.equal(result.amountMinorUnits, 19900);
  assert.equal(result.currencyId, 1);
  const priceSql = calls.find((sql) => sql.includes('FROM ghm.commercial_plan_price'));
  assert.ok(priceSql);
  assert.match(priceSql, /price\.plan_version_id = \$1/);
  assert.match(priceSql, /price\.lifecycle_status = 'active'/);
  assert.match(priceSql, /price\.country_id = \$3::bigint/);
  assert.deepEqual(params[calls.indexOf(priceSql!)], [31, preparedAt, 1]);
  const attemptInsert = calls.find((sql) => sql.includes('INSERT INTO ghm.commercial_payment_attempt'));
  assert.ok(attemptInsert);
  assert.match(attemptInsert, /provider_code/);
  assert.match(attemptInsert, /'payfast'/);
  assert.equal(calls.filter((sql) => sql.includes('INSERT INTO ghm.commercial_event')).length, 1);
  assert.equal(calls[0], 'BEGIN');
  assert.equal(calls.at(-1), 'COMMIT');
});

test('Commercial payment preparation rolls back when event persistence fails', async () => {
  const client = {
    async query(sql: string): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.includes('FROM ghm.business_membership')) return { rowCount: 1, rows: [] };
      if (sql.includes('FROM ghm.commercial_payment_attempt')) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM ghm.commercial_subscription')) return { rowCount: 1, rows: [subscriptionRow] };
      if (sql === 'SELECT now() AS prepared_at') return { rowCount: 1, rows: [{ prepared_at: new Date(1000) }] };
      if (sql.includes('FROM ghm.commercial_plan_price')) return { rowCount: 1, rows: [{ id: 41, amount_minor_units: 19900, currency_id: 1, billing_interval: 'month' }] };
      if (sql.includes('INSERT INTO ghm.commercial_payment_attempt')) return { rowCount: 1, rows: [{
        id: 71, business_id: businessId, subscription_id: 21, price_id: 41, initiated_by: userId, provider_code: 'payfast',
        attempt_status: 'pending_checkout', amount_minor_units: 19900, currency_id: 1,
        billing_interval: 'month', idempotency_key: 'idem-key-123', checkout_reference: null,
        expires_at: null, failure_code: null, failure_message: null,
        created_at: new Date(1000), updated_at: new Date(1000),
      }] };
      if (sql.includes('INSERT INTO ghm.commercial_event')) throw new Error('payment event failure');
      throw new Error(`Unexpected SQL in rollback test: ${sql}`);
    },
    release(): void {},
  };
  const pool: TransactionPool = { async connect(): Promise<PoolClient> { return client as unknown as PoolClient; } };
  await assert.rejects(
    () => new PostgresCommercialRepository(pool).prepareCommercialPayment(
      context(),
      { businessId, idempotencyKey: 'idem-key-123' },
    ),
    /payment event failure/,
  );
});


test('Commercial payment preparation fails closed when idempotency replay finds an unreconciled provider', async () => {
  const existing = {
    id: 71, business_id: businessId, subscription_id: 21, price_id: 41, initiated_by: userId, provider_code: null,
    attempt_status: 'pending_checkout', amount_minor_units: 19900, currency_id: 1,
    billing_interval: 'month', idempotency_key: 'idem-key-123', checkout_reference: null,
    expires_at: null, failure_code: null, failure_message: null,
    created_at: new Date(1000), updated_at: new Date(1000),
  };
  const client = {
    async query(sql: string): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.includes('FROM ghm.business_membership')) return { rowCount: 1, rows: [] };
      if (sql.includes('FROM ghm.commercial_payment_attempt')) return { rowCount: 1, rows: [existing] };
      throw new Error(`Unexpected SQL in provider reconciliation test: ${sql}`);
    },
    release(): void {},
  };
  const pool: TransactionPool = { async connect(): Promise<PoolClient> { return client as unknown as PoolClient; } };
  await assert.rejects(
    () => new PostgresCommercialRepository(pool).prepareCommercialPayment(
      context(),
      { businessId, idempotencyKey: 'idem-key-123' },
    ),
    /provider reconciliation required/,
  );
});

test('Commercial offer resolves South African prices, trial eligibility and founding availability from canonical rows', async () => {
  const evaluatedAt = new Date('2026-11-10T00:00:00.000Z');
  const { pool, calls, params } = createFakePool({
    subscriptionRow: null,
    offerRow: {
      plan_code: 'business_pro', plan_name: 'Business Pro', plan_version_id: 31,
      trial_days: 14, founding_limit: 100, evaluated_at: evaluatedAt,
      currency_code: 'ZAR', founding_price_count: 1, founding_price_id: 41, founding_amount_minor_units: 19900,
      standard_price_count: 1, standard_price_id: 42, standard_amount_minor_units: 29900,
      founding_allocated: 4, trial_used: false,
    },
  });
  const result = await new PostgresCommercialRepository(pool).getCommercialOffer(context(), businessId, 'business_pro');
  assert.ok(result);
  assert.equal(result.businessId, businessId);
  assert.equal(result.planVersionId, 31);
  assert.equal(result.trialEligible, true);
  assert.equal(result.trialDays, 14);
  assert.equal(result.foundingAvailable, true);
  assert.equal(result.foundingAllocated, 4);
  assert.deepEqual(result.foundingPrice, { priceId: 41, amountMinorUnits: 19900, currencyCode: 'ZAR', billingInterval: 'month' });
  assert.deepEqual(result.standardPrice, { priceId: 42, amountMinorUnits: 29900, currencyCode: 'ZAR', billingInterval: 'month' });
  const offerSql = calls.find(sql => sql.includes('FROM ghm.commercial_plan plan'));
  assert.ok(offerSql);
  assert.match(offerSql, /country\.code = 'ZA'/);
  assert.match(offerSql, /currency\.code = 'ZAR'/);
  assert.match(offerSql, /commercial_founding_allocation/);
  assert.deepEqual(params[calls.indexOf(offerSql!)], ['business_pro', businessId]);
});

test('Commercial offer fails closed when the plan has no eligible South African price rows', async () => {
  const { pool } = createFakePool({
    subscriptionRow: null,
    offerRow: {
      plan_code: 'business_pro', plan_name: 'Business Pro', plan_version_id: 31,
      trial_days: 14, founding_limit: 100, evaluated_at: new Date(1000),
      currency_code: null, founding_price_id: null, founding_amount_minor_units: null,
      standard_price_id: null, standard_amount_minor_units: null,
      founding_allocated: 0, trial_used: false,
    },
  });
  const result = await new PostgresCommercialRepository(pool).getCommercialOffer(context(), businessId, 'business_pro');
  assert.ok(result);
  assert.equal(result.foundingPrice, null);
  assert.equal(result.standardPrice, null);
  assert.equal(result.foundingAvailable, false);
});

test('Commercial offer does not disclose plan or price data without active Business membership', async () => {
  const { pool, calls } = createFakePool({
    membership: false,
    offerRow: { plan_code: 'business_pro' },
  });
  await assert.rejects(
    () => new PostgresCommercialRepository(pool).getCommercialOffer(context(), businessId, 'business_pro'),
    /Business read permission required/,
  );
  assert.equal(calls.some(sql => sql.includes('FROM ghm.commercial_plan plan')), false);
});

test('Commercial offer fails closed when effective price rows are ambiguous', async () => {
  const { pool } = createFakePool({
    subscriptionRow: null,
    offerRow: {
      plan_code: 'business_pro', plan_name: 'Business Pro', plan_version_id: 31,
      trial_days: 14, founding_limit: 100, evaluated_at: new Date(1000),
      currency_code: 'ZAR', founding_price_count: 2, founding_price_id: 42,
      founding_amount_minor_units: 19900, standard_price_count: 2,
      standard_price_id: 44, standard_amount_minor_units: 29900,
      founding_allocated: 0, trial_used: false,
    },
  });
  const result = await new PostgresCommercialRepository(pool).getCommercialOffer(context(), businessId, 'business_pro');
  assert.ok(result);
  assert.equal(result.foundingPrice, null);
  assert.equal(result.standardPrice, null);
  assert.equal(result.foundingAvailable, false);
});

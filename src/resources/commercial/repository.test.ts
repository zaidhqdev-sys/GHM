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
} = {}): { pool: TransactionPool; calls: string[]; params: unknown[][] } => {
  const calls: string[] = [];
  const params: unknown[][] = [];
  const client = {
    async query(sql: string, queryParams?: unknown[]): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> {
      calls.push(sql);
      params.push(queryParams ?? []);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql === 'SELECT now() AS activated_at') return { rowCount: 1, rows: [{ activated_at: options.activatedAt ?? new Date(1000) }] };
      if (sql.includes('FROM ghm.business_membership') && sql.includes("membership_role IN ('owner', 'administrator')")) {
        return { rowCount: options.management === false ? 0 : 1, rows: [] };
      }
      if (sql.includes('FROM ghm.business_membership') && sql.includes("membership_status = 'active'")) {
        return { rowCount: options.membership === false ? 0 : 1, rows: [] };
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
      if (sql.includes('INSERT INTO ghm.commercial_event')) return { rowCount: 1, rows: [] };
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

test('Commercial subscription read rejects unauthorized membership', async () => {
  const { pool } = createFakePool({ membership: false });
  await assert.rejects(() => new PostgresCommercialRepository(pool).getCommercialSubscription(context(), businessId), /Business read permission required/);
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
  const { pool } = createFakePool({ planRow: { id: 31, trial_days: 7 }, activatedAt });
  const originalConnect = pool.connect;
  let failed = false;
  pool.connect = async () => {
    const client = await originalConnect();
    const originalQuery = client.query.bind(client);
    client.query = async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO ghm.commercial_event') && !failed) {
        failed = true;
        throw new Error('event failure');
      }
      return originalQuery(sql, params);
    };
    return client;
  };
  await assert.rejects(() => new PostgresCommercialRepository(pool).activateCommercialTrial(context(), { businessId, planCode: 'business_pro' }), /event failure/);
});

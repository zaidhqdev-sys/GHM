import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';
import type {
  CommercialAccess,
  CommercialSubscription,
} from './contracts';
import { PostgresCommercialRepository } from './repository';

const businessId = 11;
const userId = 7;

const context = (role: AuthContext['role'] = 'business'): AuthContext => ({
  userId,
  role,
});

const subscriptionRow = {
  id: 21,
  business_id: businessId,
  plan_version_id: 31,
  price_id: 41,
  trial_id: null,
  lifecycle_status: 'active',
  current_period_start: new Date(1000),
  current_period_end: new Date(2000),
  cancel_at_period_end: false,
  cancelled_at: null,
  founding_sequence: null,
  founding_protected_until: null,
  provider_reference: null,
  created_at: new Date(0),
  updated_at: new Date(0),
};

const entitlementRows = [
  {
    entitlement_code: 'quote_management',
    access_level: 'enabled',
    metadata: { source: 'commercial-plan-version' },
  },
];

const createFakePool = (options: {
  membership?: boolean;
  subscriptionRow?: Record<string, unknown> | null;
  entitlementRows?: Record<string, unknown>[];
} = {}): {
  pool: TransactionPool;
  calls: string[];
} => {
  const calls: string[] = [];

  const client = {
    async query(
      sql: string,
      _params?: unknown[],
    ): Promise<{
      rowCount: number;
      rows: Record<string, unknown>[];
    }> {
      calls.push(sql);

      if (
        sql.includes('FROM ghm.business_membership') &&
        sql.includes("membership_status = 'active'")
      ) {
        return {
          rowCount: options.membership === false ? 0 : 1,
          rows: [],
        };
      }

      if (sql.includes('FROM ghm.commercial_subscription')) {
        const row = options.subscriptionRow === undefined
          ? subscriptionRow
          : options.subscriptionRow;

        return {
          rowCount: row ? 1 : 0,
          rows: row ? [row] : [],
        };
      }

      if (sql.includes('FROM ghm.commercial_plan_entitlement')) {
        return {
          rowCount: options.entitlementRows?.length ?? entitlementRows.length,
          rows:
            options.entitlementRows === undefined
              ? entitlementRows
              : options.entitlementRows,
        };
      }

      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return {
          rowCount: 0,
          rows: [],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    },

    release(): void {},
  };

  return {
    pool: {
      async connect(): Promise<PoolClient> {
        return client as unknown as PoolClient;
      },
    },
    calls,
  };
};

test('Commercial access read allows an active Business owner', async () => {
  const { pool, calls } = createFakePool({
    membership: true,
  });

  const repository = new PostgresCommercialRepository(pool);

  const result = await repository.getCommercialAccess(
    context('business'),
    businessId,
  );

  assert.equal(result.businessId, businessId);
  assert.equal(result.subscriptionId, 21);
  assert.equal(result.status, 'active');
  assert.deepEqual(result.entitlements, [
    {
      code: 'quote_management',
      accessLevel: 'enabled',
      metadata: { source: 'commercial-plan-version' },
    },
  ]);

  assert.equal(
    calls.some((sql) =>
      sql.includes('FROM ghm.business_membership') &&
      sql.includes("membership_status = 'active'"),
    ),
    true,
  );
});

test('Commercial access read allows an active Business administrator', async () => {
  const { pool } = createFakePool({
    membership: true,
  });

  const repository = new PostgresCommercialRepository(pool);

  const result = await repository.getCommercialAccess(
    context('customer'),
    businessId,
  );

  assert.equal(result.subscriptionId, 21);
  assert.equal(result.status, 'active');
});

test('Commercial access read allows an active Business member', async () => {
  const { pool, calls } = createFakePool({
    membership: true,
  });

  const repository = new PostgresCommercialRepository(pool);

  const result = await repository.getCommercialAccess(
    context('business'),
    businessId,
  );

  assert.equal(result.businessId, businessId);
  assert.equal(result.status, 'active');

  const membershipQuery = calls.find((sql) =>
    sql.includes('FROM ghm.business_membership'),
  );

  assert.ok(membershipQuery);
  assert.equal(
    membershipQuery.includes("membership_status = 'active'"),
    true,
  );
  assert.equal(
    membershipQuery.includes(
      "membership_role IN ('owner', 'administrator')",
    ),
    false,
  );
});

test('Commercial access read rejects inactive or revoked Business membership', async () => {
  const { pool, calls } = createFakePool({
    membership: false,
  });

  const repository = new PostgresCommercialRepository(pool);

  await assert.rejects(
    () =>
      repository.getCommercialAccess(
        context(),
        businessId,
      ),
    /Business read permission required/,
  );

  assert.equal(
    calls.some((sql) =>
      sql.includes('FROM ghm.commercial_subscription'),
    ),
    false,
  );
});

test('Commercial access read rejects an unrelated Business', async () => {
  const { pool } = createFakePool({
    membership: false,
  });

  const repository = new PostgresCommercialRepository(pool);

  await assert.rejects(
    () =>
      repository.getCommercialAccess(
        context(),
        999,
      ),
    /Business read permission required/,
  );
});

test('Commercial access read rejects an invalid Business ID before opening a transaction', async () => {
  let connected = false;

  const pool: TransactionPool = {
    async connect(): Promise<PoolClient> {
      connected = true;
      throw new Error('transaction should not be opened');
    },
  };

  const repository = new PostgresCommercialRepository(pool);

  await assert.rejects(
    () =>
      repository.getCommercialAccess(
        context(),
        0,
      ),
    /businessId must be a positive integer/,
  );

  assert.equal(connected, false);
});

test('Commercial access returns basic when no current subscription exists', async () => {
  const { pool } = createFakePool({
    membership: true,
    subscriptionRow: null,
  });

  const repository = new PostgresCommercialRepository(pool);

  const result = await repository.getCommercialAccess(
    context(),
    businessId,
  );

  const expected: CommercialAccess = {
    businessId,
    subscriptionId: null,
    status: 'basic',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    foundingProtectedUntil: null,
    entitlements: [],
    evaluatedAt: result.evaluatedAt,
  };

  assert.deepEqual(result, expected);
});

test('Commercial access returns the current subscription and authoritative entitlements', async () => {
  const { pool } = createFakePool({
    membership: true,
    subscriptionRow: subscriptionRow,
    entitlementRows: entitlementRows,
  });

  const repository = new PostgresCommercialRepository(pool);

  const result = await repository.getCommercialAccess(
    context(),
    businessId,
  );

  assert.equal(result.subscriptionId, 21);
  assert.equal(result.status, 'active');
  assert.equal(result.currentPeriodStart?.getTime(), 1000);
  assert.equal(result.currentPeriodEnd?.getTime(), 2000);
  assert.equal(result.cancelAtPeriodEnd, false);
  assert.deepEqual(result.entitlements, [
    {
      code: 'quote_management',
      accessLevel: 'enabled',
      metadata: { source: 'commercial-plan-version' },
    },
  ]);
});

test('Commercial access returns no entitlements for past_due subscription', async () => {
  const { pool, calls } = createFakePool({
    membership: true,
    subscriptionRow: {
      ...subscriptionRow,
      lifecycle_status: 'past_due',
    },
    entitlementRows,
  });

  const repository = new PostgresCommercialRepository(pool);

  const result = await repository.getCommercialAccess(
    context(),
    businessId,
  );

  assert.equal(result.status, 'past_due');
  assert.deepEqual(result.entitlements, []);

  assert.equal(
    calls.some((sql) =>
      sql.includes('FROM ghm.commercial_plan_entitlement'),
    ),
    false,
  );
});

test('Commercial access returns no entitlements for suspended subscription', async () => {
  const { pool, calls } = createFakePool({
    membership: true,
    subscriptionRow: {
      ...subscriptionRow,
      lifecycle_status: 'suspended',
    },
    entitlementRows,
  });

  const repository = new PostgresCommercialRepository(pool);

  const result = await repository.getCommercialAccess(
    context(),
    businessId,
  );

  assert.equal(result.status, 'suspended');
  assert.deepEqual(result.entitlements, []);

  assert.equal(
    calls.some((sql) =>
      sql.includes('FROM ghm.commercial_plan_entitlement'),
    ),
    false,
  );
});
test('Commercial subscription read returns the current non-terminal subscription', async () => {
  const { pool } = createFakePool({
    membership: true,
    subscriptionRow: {
      ...subscriptionRow,
      lifecycle_status: 'past_due',
    },
  });

  const repository = new PostgresCommercialRepository(pool);

  const result = await repository.getCommercialSubscription(
    context(),
    businessId,
  );

  assert.ok(result);

  const expected: CommercialSubscription = {
    id: 21,
    businessId,
    planVersionId: 31,
    priceId: 41,
    trialId: null,
    lifecycleStatus: 'past_due',
    currentPeriodStart: new Date(1000),
    currentPeriodEnd: new Date(2000),
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    foundingSequence: null,
    foundingProtectedUntil: null,
    providerReference: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  assert.deepEqual(result, expected);
});

test('Commercial subscription read returns null when no current subscription exists', async () => {
  const { pool } = createFakePool({
    membership: true,
    subscriptionRow: null,
  });

  const repository = new PostgresCommercialRepository(pool);

  const result = await repository.getCommercialSubscription(
    context(),
    businessId,
  );

  assert.equal(result, null);
});

test('Commercial subscription read rejects unauthorized Business membership', async () => {
  const { pool, calls } = createFakePool({
    membership: false,
  });

  const repository = new PostgresCommercialRepository(pool);

  await assert.rejects(
    () =>
      repository.getCommercialSubscription(
        context(),
        businessId,
      ),
    /Business read permission required/,
  );

  assert.equal(
    calls.some((sql) =>
      sql.includes('FROM ghm.commercial_subscription'),
    ),
    false,
  );
});

test('Commercial repository reads execute inside the authorized transaction boundary', async () => {
  const { pool, calls } = createFakePool({
    membership: true,
    subscriptionRow: null,
  });

  const repository = new PostgresCommercialRepository(pool);

  await repository.getCommercialAccess(
    context(),
    businessId,
  );

  assert.equal(calls[0], 'BEGIN');
  assert.equal(calls.at(-1), 'COMMIT');
});

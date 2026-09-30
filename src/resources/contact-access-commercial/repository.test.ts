import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import type { AuthContext } from '../../auth/authorization';
import type { PoolClient } from 'pg';
import type { TransactionPool } from '../../db/transaction';
import { PostgresContactAccessCommercialRepository } from './repository';

const businessId = 265;
const opportunityId = 501;
const userId = 468;
const businessContext = (): AuthContext => ({ userId, role: 'business' });

const factRow = (overrides: Record<string, unknown> = {}) => ({
  id: 77,
  business_id: businessId,
  opportunity_id: opportunityId,
  idempotency_key: 'idem-key-001',
  verification_status: 'verified',
  commercial_source: 'ghm_commercial_boundary',
  verified_by_account_id: userId,
  verified_at: new Date('2026-09-23T12:00:00.000Z'),
  created_at: new Date('2026-09-23T12:00:00.000Z'),
  ...overrides,
});

const grantRow = (overrides: Record<string, unknown> = {}) => ({
  commercial_fact_id: 77,
  entitlement_id: 11,
  business_id: businessId,
  opportunity_id: opportunityId,
  authorization_status: 'active',
  grant_reason: 'verified_commercial',
  grant_source: 'ghm_commercial_boundary',
  granted_by_account_id: userId,
  granted_at: new Date('2026-09-23T12:00:00.000Z'),
  commercial_event_reference: 'contact_access_commercial_fact:77',
  revoked_at: null,
  revoked_by_account_id: null,
  revocation_reason: null,
  created_at: new Date('2026-09-23T12:00:00.000Z'),
  updated_at: new Date('2026-09-23T12:00:00.000Z'),
  ...overrides,
});

const createFakePool = (options: {
  grantRow?: Record<string, unknown> | null;
  grantError?: Error;
  factRow?: Record<string, unknown> | null;
  grantSequence?: Array<Record<string, unknown>>;
} = {}): { pool: TransactionPool; calls: string[]; params: unknown[][] } => {
  const calls: string[] = [];
  const params: unknown[][] = [];
  let grantIndex = 0;
  const client = {
    async query(sql: string, queryParams?: unknown[]): Promise<{ rowCount: number; rows: Record<string, unknown>[] }> {
      calls.push(sql);
      params.push(queryParams ?? []);
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };

      if (sql.includes("set_config('ghm.actor_account_id'")) {
        return { rowCount: 1, rows: [{ set_config: String(queryParams?.[0] ?? '') }] };
      }

      if (sql.includes('FROM ghm.grant_contact_access_commercial(')) {
        if (options.grantError) throw options.grantError;
        if (options.grantSequence && options.grantSequence.length > 0) {
          const row = options.grantSequence[grantIndex] ?? options.grantSequence[options.grantSequence.length - 1];
          grantIndex += 1;
          return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
        }
        const row = options.grantRow === undefined ? grantRow() : options.grantRow;
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      if (sql.includes('FROM ghm.contact_access_commercial_fact')) {
        const row = options.factRow === undefined ? factRow() : options.factRow;
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
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
    params,
  };
};

const assertNoContactOrPaymentFields = (value: unknown): void => {
  const encoded = JSON.stringify(value);
  for (const forbidden of [
    'customerName',
    'customerPhone',
    'customerEmail',
    'customerId',
    'creatorAccountId',
    'commercial_payment_attempt',
    'commercial_payment_transaction',
    'provider_payload',
    'webhook',
  ]) {
    assert.equal(encoded.includes(forbidden), false, `must not contain ${forbidden}`);
  }
};

test('Commercial authorization sets actor context and calls governed grant function', async () => {
  const { pool, calls, params } = createFakePool();
  const result = await new PostgresContactAccessCommercialRepository(pool).authorizeContactAccessFromVerifiedCommercial(
    businessContext(),
    {
      businessId,
      opportunityId,
      idempotencyKey: 'idem-key-001',
      commercialSource: 'ghm_commercial_boundary',
    },
  );

  assert.equal(result.commercialFact.id, 77);
  assert.equal(result.entitlement.grantReason, 'verified_commercial');
  assert.equal(result.entitlement.commercialFactId, 77);
  assert.equal(result.entitlement.commercialEventReference, 'contact_access_commercial_fact:77');
  assertNoContactOrPaymentFields(result);
  assert.equal(calls.some((sql) => sql.includes("set_config('ghm.actor_account_id'")), true);
  assert.deepEqual(params.find((_, i) => calls[i]?.includes('grant_contact_access_commercial')), [
    businessId,
    opportunityId,
    'idem-key-001',
    'ghm_commercial_boundary',
  ]);
  assert.equal(calls.some((sql) => sql.includes('commercial_payment_attempt')), false);
  assert.equal(calls.some((sql) => sql.includes('commercial_payment_transaction')), false);
});

test('Commercial authorization idempotent replay returns stable fact identity', async () => {
  const shared = grantRow({ entitlement_id: 11 });
  const { pool } = createFakePool({ grantSequence: [shared, shared], factRow: factRow() });
  const repository = new PostgresContactAccessCommercialRepository(pool);
  const input = {
    businessId,
    opportunityId,
    idempotencyKey: 'idem-key-001',
    commercialSource: 'ghm_commercial_boundary',
  };
  const [first, second] = await Promise.all([
    repository.authorizeContactAccessFromVerifiedCommercial(businessContext(), input),
    repository.authorizeContactAccessFromVerifiedCommercial(businessContext(), input),
  ]);
  assert.equal(first.commercialFact.id, 77);
  assert.equal(second.commercialFact.id, 77);
  assert.equal(first.entitlement.id, 11);
  assert.equal(second.entitlement.id, 11);
});

test('Commercial authorization maps management denial from governed function', async () => {
  const { pool } = createFakePool({
    grantError: new Error('Business management permission required'),
  });
  await assert.rejects(
    () => new PostgresContactAccessCommercialRepository(pool).authorizeContactAccessFromVerifiedCommercial(
      businessContext(),
      {
        businessId,
        opportunityId,
        idempotencyKey: 'idem-key-001',
        commercialSource: 'ghm_commercial_boundary',
      },
    ),
    /Business management permission required/,
  );
});

test('Commercial authorization maps idempotency scope mismatch from governed function', async () => {
  const { pool } = createFakePool({
    grantError: new Error('Commercial fact idempotency scope mismatch'),
  });
  await assert.rejects(
    () => new PostgresContactAccessCommercialRepository(pool).authorizeContactAccessFromVerifiedCommercial(
      businessContext(),
      {
        businessId: 999,
        opportunityId,
        idempotencyKey: 'idem-key-001',
        commercialSource: 'ghm_commercial_boundary',
      },
    ),
    /Commercial fact idempotency scope mismatch/,
  );
});

test('Migration defines dedicated commercial fact table and idempotency uniqueness', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'database/migrations/20260923153000_create_contact_access_commercial_fact.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /CREATE TABLE ghm\.contact_access_commercial_fact/);
  assert.match(sql, /contact_access_commercial_fact_idempotency_uq/);
  assert.match(sql, /verification_status = 'verified'/);
  assert.match(sql, /grant_reason IN \('manual_promotional', 'verified_commercial'\)/);
  assert.match(sql, /grant_contact_access_commercial/);
  assert.equal(sql.includes('commercial_payment_attempt'), false);
  assert.equal(sql.includes('customer_name'), false);
});

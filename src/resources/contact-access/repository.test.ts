import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import type { AuthContext } from '../../auth/authorization';
import type { PoolClient } from 'pg';
import type { TransactionPool } from '../../db/transaction';
import type { ContactAccessEntitlement } from './contracts';
import { PostgresContactAccessRepository } from './repository';

const businessId = 265;
const opportunityId = 501;
const userId = 468;
const businessContext = (): AuthContext => ({ userId, role: 'business' });

const entitlementRow = (overrides: Record<string, unknown> = {}) => ({
  id: 11,
  business_id: businessId,
  opportunity_id: opportunityId,
  authorization_status: 'active',
  grant_reason: 'manual_promotional',
  grant_source: 'founder_promo',
  granted_by_account_id: userId,
  granted_at: new Date('2026-09-23T10:00:00.000Z'),
  commercial_event_reference: null,
  revoked_at: null,
  revoked_by_account_id: null,
  revocation_reason: null,
  created_at: new Date('2026-09-23T10:00:00.000Z'),
  updated_at: new Date('2026-09-23T10:00:00.000Z'),
  ...overrides,
});

const enquiryContactRow = (overrides: Record<string, unknown> = {}) => ({
  business_id: businessId,
  customer_name: 'Customer One',
  customer_phone: '+27123456789',
  customer_email: 'customer@example.com',
  ...overrides,
});

const createFakePool = (options: {
  membership?: boolean;
  grantRow?: Record<string, unknown> | null;
  grantError?: Error;
  revokeRow?: Record<string, unknown> | null;
  revokeError?: Error;
  activeRow?: Record<string, unknown> | null;
  revokedRow?: Record<string, unknown> | null;
  grantSequence?: Array<Record<string, unknown>>;
  enquiryRows?: Array<Record<string, unknown>> | null;
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

      if (sql.includes('FROM ghm.business_membership') && sql.includes("membership_status = 'active'")) {
        return { rowCount: options.membership === false ? 0 : 1, rows: [] };
      }

      if (sql.includes('FROM ghm.grant_contact_access_manual(')) {
        if (options.grantError) throw options.grantError;
        if (options.grantSequence && options.grantSequence.length > 0) {
          const row = options.grantSequence[grantIndex] ?? options.grantSequence[options.grantSequence.length - 1];
          grantIndex += 1;
          return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
        }
        const row = options.grantRow === undefined ? entitlementRow() : options.grantRow;
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      if (sql.includes('FROM ghm.revoke_contact_access(')) {
        if (options.revokeError) throw options.revokeError;
        const row = options.revokeRow === undefined
          ? entitlementRow({
            authorization_status: 'revoked',
            revoked_at: new Date('2026-09-23T11:00:00.000Z'),
            revoked_by_account_id: userId,
            revocation_reason: 'manual_admin',
          })
          : options.revokeRow;
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      if (sql.includes('FROM ghm.contact_access_entitlement') && sql.includes("authorization_status = 'active'")) {
        // Disclose uses SELECT 1 LIMIT 1; getContactAccess uses full columns.
        const row = options.activeRow === undefined ? null : options.activeRow;
        if (sql.includes('SELECT 1')) {
          return { rowCount: row ? 1 : 0, rows: row ? [{ '?column?': 1 }] : [] };
        }
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      if (sql.includes('FROM ghm.contact_access_entitlement') && sql.includes("authorization_status = 'revoked'")) {
        const row = options.revokedRow === undefined ? null : options.revokedRow;
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }

      if (sql.includes('FROM ghm.enquiry') && sql.includes('customer_name')) {
        const rows = options.enquiryRows === undefined
          ? [enquiryContactRow()]
          : (options.enquiryRows ?? []);
        return { rowCount: rows.length, rows };
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

const assertNoContactFields = (value: unknown): void => {
  const encoded = JSON.stringify(value);
  for (const forbidden of [
    'customerPhone',
    'customerEmail',
    'customerName',
    'customerId',
    'creatorAccountId',
    'customer_phone',
    'customer_email',
    'customer_name',
    'customer_id',
    'creator_account_id',
  ]) {
    assert.equal(encoded.includes(forbidden), false, `must not contain ${forbidden}`);
  }
};

test('Grant sets transaction-local actor context and does not pass account id as function argument', async () => {
  const { pool, calls, params } = createFakePool();
  const result = await new PostgresContactAccessRepository(pool).grantContactAccess(businessContext(), {
    businessId,
    opportunityId,
    grantReason: 'manual_promotional',
    grantSource: 'founder_promo',
  });

  assert.equal(result.authorizationStatus, 'active');
  assert.equal(calls.some((sql) => sql.includes("set_config('ghm.actor_account_id'")), true);
  assert.deepEqual(params.find((_, i) => calls[i]?.includes("set_config('ghm.actor_account_id'")), [String(userId)]);
  assert.deepEqual(params.find((_, i) => calls[i]?.includes('grant_contact_access_manual')), [
    businessId,
    opportunityId,
    'founder_promo',
  ]);
  assertNoContactFields(result);
});

test('Duplicate grant reuses active entitlement without contact fields', async () => {
  const existing = entitlementRow({ id: 42, grant_source: 'original' });
  const { pool } = createFakePool({ grantRow: existing });
  const first = await new PostgresContactAccessRepository(pool).grantContactAccess(businessContext(), {
    businessId,
    opportunityId,
    grantReason: 'manual_promotional',
    grantSource: 'retry',
  });
  assert.equal(first.id, 42);
  assert.equal(first.grantSource, 'original');
  assert.equal(first.authorizationStatus, 'active');
  assertNoContactFields(first);
});

test('Re-grant after revoke creates a new active authorization while prior revoked history remains addressable', async () => {
  const revoked = entitlementRow({
    id: 11,
    authorization_status: 'revoked',
    revoked_at: new Date('2026-09-23T11:00:00.000Z'),
    revoked_by_account_id: userId,
    revocation_reason: 'manual_admin',
  });
  const regranted = entitlementRow({ id: 22, grant_source: 'regrant_promo' });
  const { pool } = createFakePool({
    grantSequence: [entitlementRow({ id: 11 }), regranted],
    revokeRow: revoked,
    activeRow: regranted,
    revokedRow: revoked,
  });
  const repository = new PostgresContactAccessRepository(pool);

  const first = await repository.grantContactAccess(businessContext(), {
    businessId,
    opportunityId,
    grantReason: 'manual_promotional',
    grantSource: 'founder_promo',
  });
  assert.equal(first.id, 11);
  assert.equal(first.authorizationStatus, 'active');

  const revokedResult = await repository.revokeContactAccess(businessContext(), {
    businessId,
    opportunityId,
    revocationReason: 'manual_admin',
  });
  assert.equal(revokedResult.id, 11);
  assert.equal(revokedResult.authorizationStatus, 'revoked');

  const second = await repository.grantContactAccess(businessContext(), {
    businessId,
    opportunityId,
    grantReason: 'manual_promotional',
    grantSource: 'regrant_promo',
  });
  assert.equal(second.id, 22);
  assert.equal(second.authorizationStatus, 'active');
  assert.notEqual(second.id, revokedResult.id);

  const check = await repository.getContactAccess(businessContext(), businessId, opportunityId);
  assert.equal(check.status, 'active');
  assert.equal(check.entitlement?.id, 22);
});

test('Grant without owner/admin management membership fails closed for target Business', async () => {
  const { pool } = createFakePool({
    grantError: new Error('Business management permission required'),
  });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).grantContactAccess(businessContext(), {
      businessId,
      opportunityId,
      grantReason: 'manual_promotional',
      grantSource: 'founder_promo',
    }),
    /Business management permission required/,
  );
});

test('Enquiry Business mismatch fails closed on grant', async () => {
  const { pool } = createFakePool({
    grantError: new Error('Contact Access Business does not match Enquiry recipient'),
  });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).grantContactAccess(businessContext(), {
      businessId: 999,
      opportunityId,
      grantReason: 'manual_promotional',
      grantSource: 'founder_promo',
    }),
    /Contact Access Business does not match Enquiry recipient/,
  );
});

test('Lifecycle-ineligible Opportunity states fail closed on grant', async () => {
  const ineligible = ['draft', 'awarded', 'in_progress', 'completed', 'cancelled', 'archived'] as const;
  for (const _state of ineligible) {
    const { pool } = createFakePool({
      grantError: new Error('Opportunity is not eligible for Contact Access grant'),
    });
    await assert.rejects(
      () => new PostgresContactAccessRepository(pool).grantContactAccess(businessContext(), {
        businessId,
        opportunityId,
        grantReason: 'manual_promotional',
        grantSource: 'founder_promo',
      }),
      /Opportunity is not eligible for Contact Access grant/,
    );
  }
});

test('Check returns active entitlement for Business membership', async () => {
  const { pool } = createFakePool({ activeRow: entitlementRow() });
  const result = await new PostgresContactAccessRepository(pool).getContactAccess(
    businessContext(),
    businessId,
    opportunityId,
  );
  assert.equal(result.status, 'active');
  assert.equal(result.entitlement?.id, 11);
  assertNoContactFields(result);
});

test('Check returns revoked when only revoked history exists', async () => {
  const { pool } = createFakePool({
    activeRow: null,
    revokedRow: entitlementRow({
      authorization_status: 'revoked',
      revoked_at: new Date('2026-09-23T11:00:00.000Z'),
      revoked_by_account_id: userId,
      revocation_reason: 'abuse',
    }),
  });
  const result = await new PostgresContactAccessRepository(pool).getContactAccess(
    businessContext(),
    businessId,
    opportunityId,
  );
  assert.equal(result.status, 'revoked');
  assert.equal(result.entitlement?.revocationReason, 'abuse');
  assertNoContactFields(result);
});

test('Check returns absent when no entitlement exists', async () => {
  const { pool } = createFakePool({ activeRow: null, revokedRow: null });
  const result = await new PostgresContactAccessRepository(pool).getContactAccess(
    businessContext(),
    businessId,
    opportunityId,
  );
  assert.equal(result.status, 'absent');
  assert.equal(result.entitlement, null);
});

test('Check rejects cross-Business access without membership', async () => {
  const { pool, calls } = createFakePool({ membership: false });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).getContactAccess(businessContext(), businessId, opportunityId),
    /Business read permission required/,
  );
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.contact_access_entitlement')), false);
});

test('Revoke transitions active entitlement and preserves historical fields', async () => {
  const { pool, calls, params } = createFakePool();
  const result = await new PostgresContactAccessRepository(pool).revokeContactAccess(businessContext(), {
    businessId,
    opportunityId,
    revocationReason: 'manual_admin',
  });
  assert.equal(result.authorizationStatus, 'revoked');
  assert.equal(result.revocationReason, 'manual_admin');
  assert.ok(result.revokedAt);
  assert.equal(calls.some((sql) => sql.includes("set_config('ghm.actor_account_id'")), true);
  assert.deepEqual(params.find((_, i) => calls[i]?.includes('revoke_contact_access')), [
    businessId,
    opportunityId,
    'manual_admin',
  ]);
  assertNoContactFields(result);
});

test('Revoke maps not-active conflict from governed function', async () => {
  const { pool } = createFakePool({
    revokeError: new Error('Contact Access entitlement is not active'),
  });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).revokeContactAccess(businessContext(), {
      businessId,
      opportunityId,
      revocationReason: 'retry',
    }),
    /Contact Access entitlement is not active/,
  );
});

test('Unsupported Opportunity grant fails closed from governed function', async () => {
  const { pool } = createFakePool({
    grantError: new Error('Opportunity is not Enquiry-backed'),
  });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).grantContactAccess(businessContext(), {
      businessId,
      opportunityId,
      grantReason: 'manual_promotional',
      grantSource: 'founder_promo',
    }),
    /Opportunity is not Enquiry-backed/,
  );
});

test('Missing Opportunity grant fails correctly', async () => {
  const { pool } = createFakePool({
    grantError: new Error('Opportunity not found'),
  });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).grantContactAccess(businessContext(), {
      businessId,
      opportunityId,
      grantReason: 'manual_promotional',
      grantSource: 'founder_promo',
    }),
    /Opportunity not found/,
  );
});

test('Grant rejects invalid opportunityId before querying', async () => {
  const { pool, calls } = createFakePool();
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).grantContactAccess(businessContext(), {
      businessId,
      opportunityId: 0,
      grantReason: 'manual_promotional',
      grantSource: 'founder_promo',
    }),
    /opportunityId must be a positive integer/,
  );
  assert.equal(calls.length, 0);
});

test('Contact Access entitlement shape excludes contact and identity recovery fields', async () => {
  const mapped = {
    id: 11,
    businessId,
    opportunityId,
    authorizationStatus: 'active' as const,
    grantReason: 'manual_promotional' as const,
    grantSource: 'founder_promo',
    grantedByAccountId: userId,
    grantedAt: new Date('2026-09-23T10:00:00.000Z'),
    commercialEventReference: null,
    commercialFactId: null,
    revokedAt: null,
    revokedByAccountId: null,
    revocationReason: null,
    createdAt: new Date('2026-09-23T10:00:00.000Z'),
    updatedAt: new Date('2026-09-23T10:00:00.000Z'),
  } satisfies ContactAccessEntitlement;
  assertNoContactFields(mapped);
});

test('Migration enforces one-active uniqueness, session actor identity, and concurrent grant convergence', async () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'database/migrations/20260923120000_create_contact_access.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE UNIQUE INDEX contact_access_one_active_uq/);
  assert.match(sql, /WHERE authorization_status = 'active'/);
  assert.match(sql, /current_setting\('ghm\.actor_account_id'/);
  assert.equal(sql.includes('p_account_id'), false);
  assert.match(sql, /EXCEPTION\s+WHEN unique_violation THEN/s);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION ghm\.grant_contact_access_manual\(bigint, bigint, text\) TO ghm_runtime/);
  assert.match(sql, /REVOKE ALL ON FUNCTION ghm\.grant_contact_access_manual\(bigint, bigint, text\) FROM PUBLIC/);
});

test('Concurrent duplicate grants converge on a single active authorization identity', async () => {
  // Harness cannot open real concurrent DB sessions here; prove repository reuse of the
  // singular active authorization returned by the governed function after conflict handling.
  const sharedActive = entitlementRow({ id: 77, grant_source: 'first_writer' });
  const { pool } = createFakePool({
    grantSequence: [sharedActive, sharedActive],
  });
  const repository = new PostgresContactAccessRepository(pool);
  const [a, b] = await Promise.all([
    repository.grantContactAccess(businessContext(), {
      businessId,
      opportunityId,
      grantReason: 'manual_promotional',
      grantSource: 'writer_a',
    }),
    repository.grantContactAccess(businessContext(), {
      businessId,
      opportunityId,
      grantReason: 'manual_promotional',
      grantSource: 'writer_b',
    }),
  ]);
  assert.equal(a.id, 77);
  assert.equal(b.id, 77);
  assert.equal(a.authorizationStatus, 'active');
  assert.equal(b.authorizationStatus, 'active');
  assert.equal(a.grantSource, 'first_writer');
  assert.equal(b.grantSource, 'first_writer');
});

const assertDisclosureShape = (value: unknown): void => {
  assert.deepEqual(Object.keys(value as object).sort(), ['customerEmail', 'customerName', 'customerPhone']);
  const encoded = JSON.stringify(value);
  assert.equal(encoded.includes('customerId'), false);
  assert.equal(encoded.includes('creatorAccountId'), false);
};

test('Disclose returns live contacts only when active Contact Access exists for exact pair', async () => {
  const { pool, calls, params } = createFakePool({
    activeRow: entitlementRow(),
    enquiryRows: [enquiryContactRow()],
  });
  const result = await new PostgresContactAccessRepository(pool).discloseContactAccess(
    businessContext(),
    businessId,
    opportunityId,
  );
  assert.deepEqual(result, {
    customerName: 'Customer One',
    customerPhone: '+27123456789',
    customerEmail: 'customer@example.com',
  });
  assertDisclosureShape(result);
  assert.equal(calls.some((sql) => sql.includes("authorization_status = 'active'")), true);
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.enquiry') && sql.includes('customer_name')), true);
  assert.deepEqual(
    params.find((_, i) => calls[i]?.includes('FROM ghm.contact_access_entitlement') && calls[i]?.includes("authorization_status = 'active'")),
    [businessId, opportunityId],
  );
  const enquirySql = calls.find((sql) => sql.includes('FROM ghm.enquiry') && sql.includes('customer_name'));
  assert.ok(enquirySql);
  assert.equal(enquirySql.includes('customer_id'), false);
});

test('Disclose denies absent Contact Access without reading Enquiry contacts', async () => {
  const { pool, calls } = createFakePool({ activeRow: null, enquiryRows: [enquiryContactRow()] });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).discloseContactAccess(businessContext(), businessId, opportunityId),
    /Contact Access disclosure denied/,
  );
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.enquiry') && sql.includes('customer_name')), false);
});

test('Disclose denies revoked Contact Access without reading Enquiry contacts', async () => {
  const { pool, calls } = createFakePool({
    activeRow: null,
    revokedRow: entitlementRow({ authorization_status: 'revoked' }),
    enquiryRows: [enquiryContactRow()],
  });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).discloseContactAccess(businessContext(), businessId, opportunityId),
    /Contact Access disclosure denied/,
  );
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.enquiry') && sql.includes('customer_name')), false);
});

test('Disclose denies inactive Business membership before Contact Access check', async () => {
  const { pool, calls } = createFakePool({ membership: false, activeRow: entitlementRow() });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).discloseContactAccess(businessContext(), businessId, opportunityId),
    /Business read permission required/,
  );
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.contact_access_entitlement')), false);
  assert.equal(calls.some((sql) => sql.includes('FROM ghm.enquiry')), false);
});

test('Disclose fails closed for cross-Business Enquiry recipient', async () => {
  const { pool } = createFakePool({
    activeRow: entitlementRow(),
    enquiryRows: [enquiryContactRow({ business_id: 999 })],
  });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).discloseContactAccess(businessContext(), businessId, opportunityId),
    /Opportunity Enquiry association not found/,
  );
});

test('Disclose fails closed for wrong Opportunity when no active entitlement matches', async () => {
  const { pool, params, calls } = createFakePool({ activeRow: null });
  await assert.rejects(
    () => new PostgresContactAccessRepository(pool).discloseContactAccess(businessContext(), businessId, 999),
    /Contact Access disclosure denied/,
  );
  assert.deepEqual(
    params.find((_, i) => calls[i]?.includes('FROM ghm.contact_access_entitlement') && calls[i]?.includes("authorization_status = 'active'")),
    [businessId, 999],
  );
});

test('Disclose returns live Enquiry values after contact mutation', async () => {
  const { pool } = createFakePool({
    activeRow: entitlementRow(),
    enquiryRows: [enquiryContactRow({
      customer_phone: '+27999888777',
      customer_email: 'updated@example.com',
    })],
  });
  const result = await new PostgresContactAccessRepository(pool).discloseContactAccess(
    businessContext(),
    businessId,
    opportunityId,
  );
  assert.deepEqual(result, {
    customerName: 'Customer One',
    customerPhone: '+27999888777',
    customerEmail: 'updated@example.com',
  });
  assertDisclosureShape(result);
});

test('Disclose shape excludes customerId and creatorAccountId', async () => {
  const { pool } = createFakePool({
    activeRow: entitlementRow(),
    enquiryRows: [enquiryContactRow()],
  });
  const result = await new PostgresContactAccessRepository(pool).discloseContactAccess(
    businessContext(),
    businessId,
    opportunityId,
  );
  assert.equal('customerId' in result, false);
  assert.equal('creatorAccountId' in result, false);
  assertDisclosureShape(result);
});

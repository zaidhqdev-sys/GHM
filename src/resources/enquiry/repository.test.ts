import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { PoolClient } from 'pg';
import type { TransactionPool } from '../../db/transaction';
import { PostgresEnquiryRepository } from './repository';

const ownerContext: AuthContext = { userId: 468, role: 'business' };

const enquiryRow = (overrides: Record<string, unknown> = {}) => ({
  id: '10',
  business_id: '265',
  customer_id: '99',
  customer_name: 'Customer',
  customer_phone: null,
  customer_email: null,
  project: 'Kitchen',
  description: 'Need a kitchen renovation quote',
  city: 'Durban',
  budget_min: null,
  budget_max: null,
  urgency: 'standard',
  source: 'marketplace',
  status: 'new',
  opportunity_id: null,
  created_at: new Date('2026-09-20T12:00:00.000Z'),
  updated_at: new Date('2026-09-20T12:00:00.000Z'),
  ...overrides,
});

class FakeClient {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  committed = false;
  rolledBack = false;

  constructor(
    private readonly membershipRowCount: number,
    private readonly enquiryRows: ReturnType<typeof enquiryRow>[],
  ) {}

  async query(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    if (text === 'BEGIN') return { rowCount: 0, rows: [] };
    if (text === 'COMMIT') {
      this.committed = true;
      return { rowCount: 0, rows: [] };
    }
    if (text === 'ROLLBACK') {
      this.rolledBack = true;
      return { rowCount: 0, rows: [] };
    }
    if (text.includes('FROM ghm.business_membership') && text.includes('LIMIT 1')) {
      return { rowCount: this.membershipRowCount, rows: this.membershipRowCount === 1 ? [{}] : [] };
    }
    if (text.includes('FROM ghm.enquiry e') && text.includes('ORDER BY')) {
      return { rowCount: this.enquiryRows.length, rows: this.enquiryRows };
    }
    throw new Error(`Unexpected query: ${text}`);
  }

  async release() {}
}

class FakePool implements TransactionPool {
  constructor(readonly client: FakeClient) {}
  async connect(): Promise<PoolClient> {
    return this.client as unknown as PoolClient;
  }
}

test('Received enquiry list asserts active owner then scopes by business_id with newest-first ordering', async () => {
  const newer = enquiryRow({ id: '12', created_at: new Date('2026-09-21T12:00:00.000Z') });
  const older = enquiryRow({ id: '11', created_at: new Date('2026-09-19T12:00:00.000Z') });
  const client = new FakeClient(1, [newer, older]);
  const repository = new PostgresEnquiryRepository(new FakePool(client));

  const result = await repository.getReceivedEnquiries(ownerContext, 265);

  assert.equal(result.length, 2);
  assert.equal(result[0]?.id, 12);
  assert.equal(result[1]?.id, 11);
  assert.equal(client.committed, true);

  const membershipQuery = client.queries.find((q) => q.text.includes('FROM ghm.business_membership') && q.text.includes('LIMIT 1'));
  assert.ok(membershipQuery);
  assert.deepEqual(membershipQuery.values, [265, 468]);

  const listQuery = client.queries.find((q) => q.text.includes('FROM ghm.enquiry e') && q.text.includes('ORDER BY'));
  assert.ok(listQuery);
  assert.match(listQuery.text, /e\.business_id = \$1/);
  assert.match(listQuery.text, /membership_role = 'owner'/);
  assert.match(listQuery.text, /membership_status = 'active'/);
  assert.match(listQuery.text, /ORDER BY e\.created_at DESC, e\.id DESC/);
  assert.deepEqual(listQuery.values, [265, 468]);
});

test('Received enquiry list returns empty array for active owner with no enquiries', async () => {
  const client = new FakeClient(1, []);
  const repository = new PostgresEnquiryRepository(new FakePool(client));
  const result = await repository.getReceivedEnquiries(ownerContext, 265);
  assert.deepEqual(result, []);
  assert.equal(client.committed, true);
});

test('Received enquiry list rejects inactive or missing owner membership', async () => {
  const client = new FakeClient(0, [enquiryRow()]);
  const repository = new PostgresEnquiryRepository(new FakePool(client));
  await assert.rejects(
    () => repository.getReceivedEnquiries(ownerContext, 265),
    /Business owner permission required/,
  );
  assert.equal(client.committed, false);
  assert.equal(client.rolledBack, true);
  assert.equal(
    client.queries.some((q) => q.text.includes('FROM ghm.enquiry e') && q.text.includes('ORDER BY')),
    false,
  );
});

test('Received enquiry list rejects non-positive businessId before querying', async () => {
  const client = new FakeClient(1, []);
  const repository = new PostgresEnquiryRepository(new FakePool(client));
  await assert.rejects(() => repository.getReceivedEnquiries(ownerContext, 0), /Invalid businessId/);
  assert.equal(client.queries.length, 0);
});

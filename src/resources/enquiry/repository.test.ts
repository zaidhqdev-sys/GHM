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
    private readonly entitlementRowCount = 1,
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
    if (text.includes('FROM ghm.commercial_subscription s')) {
      return { rowCount: this.entitlementRowCount, rows: this.entitlementRowCount === 1 ? [{}] : [] };
    }
    if (text.includes('FROM ghm.enquiry e') && text.includes('ORDER BY')) {
      return { rowCount: this.enquiryRows.length, rows: this.enquiryRows };
    }
    if (text.includes('FROM ghm.enquiry e') && text.includes('WHERE e.id = $1')) {
      const row = this.enquiryRows.find((item) => Number(item.id) === Number(values?.[0]));
      return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
    }
    if (text.includes('FROM ghm.business b') && text.includes("verification_status = 'approved'")) {
      return { rowCount: 1, rows: [{}] };
    }
    if (text.includes('FROM ghm.opportunity_type')) return { rowCount: 1, rows: [{ id: 7 }] };
    if (text.includes('INSERT INTO ghm.opportunity') && text.includes('RETURNING id')) {
      return { rowCount: 1, rows: [{ id: 900 }] };
    }
    if (text.includes('INSERT INTO ghm.opportunity_participant')) return { rowCount: 1, rows: [] };
    if (text.includes('INSERT INTO ghm.enquiry') && text.includes('RETURNING')) {
      return { rowCount: 1, rows: [enquiryRow({
        id: '10', business_id: String(values?.[0]), customer_id: String(values?.[1]),
        customer_name: values?.[2], project: values?.[5], description: values?.[6],
        opportunity_id: values?.[11],
      })] };
    }
    if (text.includes('INSERT INTO ghm.notification')) return { rowCount: 1, rows: [] };
    if (text.includes('UPDATE ghm.enquiry SET status = $2')) {
      const row = this.enquiryRows.find((item) => Number(item.id) === Number(values?.[0]));
      return { rowCount: row ? 1 : 0, rows: row ? [{ ...row, status: values?.[1] }] : [] };
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
  assert.match(listQuery.text, /LIMIT \$3 OFFSET \$4/);
  assert.deepEqual(listQuery.values, [265, 468, 50, 0]);
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


test('status updates require an active business.leads.manage entitlement', async () => {
  const client = new FakeClient(1, [enquiryRow({ id: '10', business_id: '265' })], 1);
  const repository = new PostgresEnquiryRepository(new FakePool(client));
  const result = await repository.updateReceivedEnquiryStatus(ownerContext, 10, { status: 'contacted' });
  assert.equal(result.status, 'contacted');
  assert.equal(client.committed, true);
  const entitlementQuery = client.queries.find((q) => q.text.includes('FROM ghm.commercial_subscription s'));
  assert.ok(entitlementQuery);
  assert.deepEqual(entitlementQuery.values, [265]);
});

test('status updates fail closed when the business lacks the leads entitlement', async () => {
  const client = new FakeClient(1, [enquiryRow({ id: '10', business_id: '265' })], 0);
  const repository = new PostgresEnquiryRepository(new FakePool(client));
  await assert.rejects(
    () => repository.updateReceivedEnquiryStatus(ownerContext, 10, { status: 'contacted' }),
    /Business Pro access required/,
  );
  assert.equal(client.committed, false);
  assert.equal(client.rolledBack, true);
  assert.equal(client.queries.some((q) => q.text.includes('UPDATE ghm.enquiry SET status = $2')), false);
});


test('Received enquiry list applies requested limit and offset using bound parameters', async () => {
  const client = new FakeClient(1, [enquiryRow()]);
  const repository = new PostgresEnquiryRepository(new FakePool(client));
  await repository.getReceivedEnquiries(ownerContext, 265, { limit: 25, offset: 75 });
  const listQuery = client.queries.find((q) => q.text.includes('FROM ghm.enquiry e') && q.text.includes('ORDER BY'));
  assert.ok(listQuery);
  assert.deepEqual(listQuery.values, [265, 468, 25, 75]);
  assert.match(listQuery.text, /LIMIT \$3 OFFSET \$4/);
});

test('Received enquiry repository rejects invalid pagination before opening a transaction', async () => {
  const client = new FakeClient(1, []);
  const repository = new PostgresEnquiryRepository(new FakePool(client));
  await assert.rejects(() => repository.getReceivedEnquiries(ownerContext, 265, { limit: 101 }), /limit must be between 1 and 100/);
  await assert.rejects(() => repository.getReceivedEnquiries(ownerContext, 265, { offset: -1 }), /offset must be between 0 and 1000000/);
  assert.equal(client.queries.length, 0);
});

const customerContext: AuthContext = { userId: 99, role: 'customer' };

const marketplaceEnquiryInput = {
  businessId: 265,
  customerName: 'Customer',
  project: 'Kitchen renovation',
  description: 'Need a kitchen renovation quote',
  city: 'Durban',
};

test('Marketplace enquiry creation inserts a lead notification for active canonical Business owners in the same transaction', async () => {
  const client = new FakeClient(1, []);
  const repository = new PostgresEnquiryRepository(new FakePool(client));
  const result = await repository.createEnquiry(customerContext, marketplaceEnquiryInput);
  assert.equal(result.id, 10);
  assert.equal(client.committed, true);
  const notification = client.queries.find(q => q.text.includes('INSERT INTO ghm.notification'));
  assert.ok(notification);
  assert.match(notification.text, /SELECT bm\.account_id, 'lead', 'New Lead!'/);
  assert.match(notification.text, /bm\.membership_role = 'owner'/);
  assert.match(notification.text, /bm\.membership_status = 'active'/);
  assert.match(notification.text, /jsonb_build_object\('enquiry_id', \$3::bigint, 'business_id', \$1::bigint\)/);
  assert.deepEqual(notification.values, [265, 'Customer is enquiring about Kitchen renovation', '10']);
  assert.ok(client.queries.findIndex(q => q.text.includes('INSERT INTO ghm.enquiry')) <
    client.queries.findIndex(q => q.text.includes('INSERT INTO ghm.notification')));
});

test('Marketplace enquiry creation rolls back if its owner notification cannot be persisted', async () => {
  class NotificationFailureClient extends FakeClient {
    async query(text: string, values?: unknown[]) {
      if (text.includes('INSERT INTO ghm.notification')) {
        this.queries.push({ text, values });
        throw new Error('notification insert failed');
      }
      return super.query(text, values);
    }
  }
  const client = new NotificationFailureClient(1, []);
  const repository = new PostgresEnquiryRepository(new FakePool(client));
  await assert.rejects(() => repository.createEnquiry(customerContext, marketplaceEnquiryInput), /notification insert failed/);
  assert.equal(client.committed, false);
  assert.equal(client.rolledBack, true);
});


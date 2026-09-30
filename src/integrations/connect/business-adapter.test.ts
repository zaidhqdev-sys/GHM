import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';
import { ConnectBusinessAdapter } from './business-adapter';

const context: AuthContext = { userId: 7, role: 'business' };

const accountRow = {
  id: 7,
  full_name: 'Business Operator',
  phone: null,
  avatar_ref: null,
  role: 'business',
  created_at: new Date(0),
  updated_at: new Date(0),
};

const businessRow = {
  id: 42,
  name: 'Acme Construction',
  slug: 'acme-construction',
  description: null,
  phone: null,
  email: null,
  insurance_verified: false,
  jobs_completed: 0,
  verification_status: 'unverified',
  is_active: true,
  created_at: new Date(0),
  updated_at: new Date(0),
};

const mappingRow = {
  id: 9,
  provider: 'supabase',
  external_business_id: '11111111-1111-4111-8111-111111111111',
  business_id: 42,
  created_at: new Date(0),
  updated_at: new Date(0),
};

class FakeClient {
  calls: string[] = [];
  constructor(private readonly provisioning: boolean) {}

  async query(sql: string): Promise<any> {
    this.calls.push(sql);
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
    if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [{ pg_advisory_xact_lock: null }] };
    if (sql.includes('FROM ghm.business_external_mapping')) {
      return this.provisioning ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [mappingRow] };
    }
    if (sql.includes('FROM ghm.business WHERE id = $1')) return { rowCount: 1, rows: [businessRow] };
    if (sql.includes('FROM ghm.account_identity')) return { rowCount: 1, rows: [accountRow] };
    if (sql.includes('INSERT INTO ghm.business (')) return { rowCount: 1, rows: [businessRow] };
    if (sql.includes('INSERT INTO ghm.business_membership')) return { rowCount: 1, rows: [] };
    if (sql.includes('auth_link_business_external_mapping')) {
      return {
        rowCount: 1,
        rows: [{
          outcome: 'created',
          ...mappingRow,
        }],
      };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }

  release(): void {}
}

const poolFor = (client: FakeClient): TransactionPool => ({
  connect: async () => client as unknown as PoolClient,
});

test('existing Connect Business mapping resolves without provisioning', async () => {
  const client = new FakeClient(false);
  const adapter = new ConnectBusinessAdapter(poolFor(client));

  const result = await adapter.provisionOrResolve(context, {
    externalBusinessId: '11111111-1111-4111-8111-111111111111',
    name: 'Ignored For Existing Mapping',
  });

  assert.equal(result.outcome, 'resolved');
  assert.equal(result.business.id, 42);
  assert.equal(result.mapping.businessId, 42);
  assert.equal(client.calls.filter(call => call.includes('INSERT INTO ghm.business (')).length, 0);
});

test('unmapped Connect Business provisions and links inside one transaction', async () => {
  const client = new FakeClient(true);
  const adapter = new ConnectBusinessAdapter(poolFor(client));

  const result = await adapter.provisionOrResolve(context, {
    externalBusinessId: '22222222-2222-4222-8222-222222222222',
    name: 'Acme Construction',
  });

  assert.equal(result.outcome, 'provisioned');
  assert.equal(result.business.id, 42);
  assert.equal(result.mapping.businessId, 42);
  assert.equal(client.calls[0], 'BEGIN');
  assert.ok(client.calls.some(call => call.includes('pg_advisory_xact_lock')));
  assert.ok(client.calls.some(call => call.includes('INSERT INTO ghm.business (')));
  assert.ok(client.calls.some(call => call.includes('INSERT INTO ghm.business_membership')));
  assert.ok(client.calls.some(call => call.includes('auth_link_business_external_mapping')));
  assert.equal(client.calls.at(-1), 'COMMIT');
});

test('Connect Business identifier validation fails before opening a transaction', async () => {
  let connects = 0;
  const pool: TransactionPool = { connect: async () => { connects += 1; throw new Error('must not connect'); } };
  const adapter = new ConnectBusinessAdapter(pool);

  await assert.rejects(
    () => adapter.provisionOrResolve(context, {
      externalBusinessId: 'not-a-uuid',
      name: 'Acme Construction',
    }),
    /Invalid Connect external Business identifier/,
  );
  assert.equal(connects, 0);
});

test('customer cannot provision a Connect Business', async () => {
  const adapter = new ConnectBusinessAdapter(poolFor(new FakeClient(true)));
  await assert.rejects(
    () => adapter.provisionOrResolve({ userId: 7, role: 'customer' }, {
      externalBusinessId: '33333333-3333-4333-8333-333333333333',
      name: 'Blocked Business',
    }),
    /Insufficient role/,
  );
});

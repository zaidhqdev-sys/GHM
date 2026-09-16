import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { PoolClient } from 'pg';
import type { TransactionPool } from '../../db/transaction';
import { PostgresOpportunityRepository } from './repository';

const context: AuthContext = { userId: 7, role: 'business' };
const opportunityRow = (ownerBusinessId: number | null = null) => ({
  id: '11', opportunity_type_id: '1', creator_account_id: '7',
  owner_business_id: ownerBusinessId === null ? null : String(ownerBusinessId),
  country_id: null, currency_id: null, title: 'Service request',
  description: 'A governed opportunity fixture.', lifecycle_status: 'draft',
  visibility: 'private', budget_min: null, budget_max: null,
  opens_at: null, closes_at: null, created_at: new Date(0), updated_at: new Date(0),
});

class FakeClient {
  readonly queries: Array<{ text: string; values?: unknown[] }> = [];
  committed = false;
  rolledBack = false;
  constructor(private readonly ownerBusinessId: number | null, private readonly failParticipant = false) {}
  async query(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    if (text.includes('FROM ghm.opportunity_type')) return { rowCount: 1, rows: [{}] };
    if (text.includes('FROM ghm.business_membership')) return { rowCount: 1, rows: [{}] };
    if (text.includes('INSERT INTO ghm.opportunity ')) return { rowCount: 1, rows: [opportunityRow(this.ownerBusinessId)] };
    if (text.includes('INSERT INTO ghm.opportunity_participant')) {
      if (this.failParticipant) throw new Error('participant insert failed');
      return { rowCount: 1, rows: [{}] };
    }
    throw new Error(`Unexpected query: ${text}`);
  }
  async release() {}
}

class FakePool implements TransactionPool {
  constructor(readonly client: FakeClient) {}
  async connect(): Promise<PoolClient> { return this.client as unknown as PoolClient; }
}

const patchTransactionCommands = (client: FakeClient) => {
  const original = client.query.bind(client);
  client.query = async (text: string, values?: unknown[]) => {
    if (text === 'BEGIN') { client.queries.push({ text, values }); return { rowCount: 0, rows: [] }; }
    if (text === 'COMMIT') { client.committed = true; client.queries.push({ text, values }); return { rowCount: 0, rows: [] }; }
    if (text === 'ROLLBACK') { client.rolledBack = true; client.queries.push({ text, values }); return { rowCount: 0, rows: [] }; }
    return original(text, values);
  };
};

test('Opportunity creation atomically establishes creator participation', async () => {
  const client = new FakeClient(null); patchTransactionCommands(client);
  const repository = new PostgresOpportunityRepository(new FakePool(client));
  const result = await repository.createOpportunity(context, { opportunityTypeId: 1, title: 'Service request', description: 'A governed opportunity fixture.' });
  assert.equal(result.id, 11); assert.equal(client.committed, true); assert.equal(client.rolledBack, false);
  const q = client.queries.find((query) => query.text.includes('INSERT INTO ghm.opportunity_participant'));
  assert.ok(q); assert.match(q.text, /'creator','active'/); assert.deepEqual(q.values, [11, 7]);
});

test('Opportunity creation atomically establishes owner Business participation when supplied', async () => {
  const client = new FakeClient(23); patchTransactionCommands(client);
  const repository = new PostgresOpportunityRepository(new FakePool(client));
  await repository.createOpportunity(context, { opportunityTypeId: 1, ownerBusinessId: 23, title: 'Business-owned opportunity', description: 'A governed opportunity fixture.' });
  const qs = client.queries.filter((query) => query.text.includes('INSERT INTO ghm.opportunity_participant'));
  assert.equal(qs.length, 2); assert.match(qs[0].text, /'creator','active'/); assert.deepEqual(qs[0].values, [11, 7]);
  assert.match(qs[1].text, /'owner','active'/); assert.deepEqual(qs[1].values, [11, 23, 7]); assert.equal(client.committed, true);
});

test('Opportunity creation rolls back when creator participation cannot be established', async () => {
  const client = new FakeClient(null, true); patchTransactionCommands(client);
  const repository = new PostgresOpportunityRepository(new FakePool(client));
  await assert.rejects(() => repository.createOpportunity(context, { opportunityTypeId: 1, title: 'Rollback opportunity', description: 'The participant write must be atomic.' }), /participant insert failed/);
  assert.equal(client.committed, false); assert.equal(client.rolledBack, true);
});

test('Opportunity creation rolls back when owner participation cannot be established', async () => {
  const client = new FakeClient(23, true); patchTransactionCommands(client);
  const repository = new PostgresOpportunityRepository(new FakePool(client));
  await assert.rejects(() => repository.createOpportunity(context, { opportunityTypeId: 1, ownerBusinessId: 23, title: 'Rollback owner opportunity', description: 'The owner participant write must be atomic.' }), /participant insert failed/);
  assert.equal(client.committed, false); assert.equal(client.rolledBack, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';
import { PostgresProjectRepository } from './repository';

const context: AuthContext = { userId: 7, role: 'customer' };
const calls: Array<{ sql: string; values?: unknown[] }> = [];
const projectRow = {
  id: '101', account_id: '7', opportunity_id: '501',
  title: 'Kitchen renovation', description: 'Renovate the existing family kitchen.',
  category: 'Renovation', province: 'KwaZulu-Natal', city: 'Durban',
  budget_min: '1000', budget_max: '5000', urgency: 'standard',
  status: 'open', created_at: new Date(0), updated_at: new Date(0),
};

class FakeClient {
  committed = false;
  rolledBack = false;
  async query(sql: string, values?: unknown[]) {
    calls.push({ sql, values });
    if (sql === 'BEGIN') return { rowCount: 0, rows: [] };
    if (sql === 'COMMIT') { this.committed = true; return { rowCount: 0, rows: [] }; }
    if (sql === 'ROLLBACK') { this.rolledBack = true; return { rowCount: 0, rows: [] }; }
    if (sql.includes('FROM ghm.opportunity_type')) return { rowCount: 1, rows: [{ id: '4' }] };
    if (sql.includes('INSERT INTO ghm.opportunity (')) return { rowCount: 1, rows: [{ id: '501' }] };
    if (sql.includes('INSERT INTO ghm.opportunity_participant')) return { rowCount: 1, rows: [{}] };
    if (sql.includes('INSERT INTO ghm.project (')) return { rowCount: 1, rows: [projectRow] };
    throw new Error(`Unexpected query: ${sql}`);
  }
  release() {}
}

const run = async (failProject = false) => {
  calls.length = 0;
  const client = new FakeClient();
  if (failProject) {
    const original = client.query.bind(client);
    client.query = async (sql, values) => {
      if (sql.includes('INSERT INTO ghm.project (')) throw new Error('project insert failed');
      return original(sql, values);
    };
  }
  const pool: TransactionPool = { connect: async () => client as unknown as PoolClient };
  const result = await new PostgresProjectRepository(pool).createProject(context, {
    title: 'Kitchen renovation',
    description: 'Renovate the existing family kitchen.',
    category: 'Renovation',
    province: 'KwaZulu-Natal',
    city: 'Durban',
    budgetMin: 1000,
    budgetMax: 5000,
  });
  return { result, client };
};

test('Project and open authenticated Opportunity are created in one transaction', async () => {
  const { result, client } = await run();
  assert.equal(result.id, 101);
  assert.equal(result.opportunityId, 501);
  assert.equal(client.committed, true);
  assert.equal(client.rolledBack, false);
  const opportunity = calls.find(x => x.sql.includes('INSERT INTO ghm.opportunity ('));
  assert.ok(opportunity);
  assert.match(opportunity.sql, /'open', 'authenticated'/);
  assert.deepEqual(opportunity.values, [4, 7, 'Kitchen renovation', 'Renovate the existing family kitchen.', 1000, 5000]);
  const project = calls.find(x => x.sql.includes('INSERT INTO ghm.project ('));
  assert.ok(project);
  assert.deepEqual(project.values, [7, 501, 'Kitchen renovation', 'Renovate the existing family kitchen.', 'Renovation', 'KwaZulu-Natal', 'Durban', 1000, 5000, 'standard']);
});

test('Project creation rolls back the Opportunity when the Project insert fails', async () => {
  calls.length = 0;
  const client = new FakeClient();
  const original = client.query.bind(client);
  client.query = async (sql, values) => {
    if (sql.includes('INSERT INTO ghm.project (')) throw new Error('project insert failed');
    return original(sql, values);
  };
  const pool: TransactionPool = { connect: async () => client as unknown as PoolClient };
  await assert.rejects(() => new PostgresProjectRepository(pool).createProject(context, {
    title: 'Kitchen renovation',
    description: 'Renovate the existing family kitchen.',
    category: 'Renovation',
    province: 'KwaZulu-Natal',
    city: 'Durban',
  }), /project insert failed/);
  assert.equal(client.committed, false);
  assert.equal(client.rolledBack, true);
});

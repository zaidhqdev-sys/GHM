import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';
import { PostgresRelationshipsOutcomesRepository } from './repository';

const context: AuthContext = { userId: 42, role: 'business' };
const createPool = (membership = true) => {
  const calls: string[] = [];
  const params: unknown[][] = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push(sql); params.push(values ?? []);
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 0, rows: [] };
      if (sql.includes('FROM ghm.business_membership')) return { rowCount: membership ? 1 : 0, rows: membership ? [{ '?column?': 1 }] : [] };
      if (sql.includes('FROM ghm.business_relationship relationship')) return { rowCount: 1, rows: [{
        id: '9', relationship_type_id: '2', source_business_id: '11', target_business_id: '12',
        originating_opportunity_id: null, created_by: '42',
        relationship_type: { id: '2', code: 'supplier', name: 'Supplier' },
        source_business: { id: 11, name: 'Source', slug: 'source' },
        target_business: { id: 12, name: 'Target', slug: 'target' },
      }] };
      if (sql.includes('FROM ghm.outcome outcome')) return { rowCount: 1, rows: [{
        id: '10', outcome_type_id: '3', subject_business_id: '11', counterparty_business_id: null,
        opportunity_id: null, business_relationship_id: '9', created_by: '42',
        outcome_type: { id: '3', code: 'completion', name: 'Completion' },
        relationship: { id: '9', source_business_id: '11', target_business_id: '12' },
      }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const pool: TransactionPool = { async connect() { return client as unknown as PoolClient; } };
  return { pool, calls, params };
};

test('business relationship reads require membership and map canonical related records', async () => {
  const { pool, calls, params } = createPool();
  const rows = await new PostgresRelationshipsOutcomesRepository(pool).getBusinessRelationships(context, 11, 'active', 20);
  assert.equal(rows[0].id, 9);
  assert.equal(rows[0].source_business_id, 11);
  assert.deepEqual(rows[0].relationship_type, { id: 2, code: 'supplier', name: 'Supplier' });
  assert.match(calls[1], /business_membership/);
  assert.deepEqual(params[1], [11, 42]);
  assert.deepEqual(params[2], [11, 'active', 20]);
});

test('business outcome reads require membership and map outcome type and relationship', async () => {
  const { pool, params } = createPool();
  const rows = await new PostgresRelationshipsOutcomesRepository(pool).getBusinessOutcomes(context, 11, undefined, 100);
  assert.equal(rows[0].id, 10);
  assert.equal(rows[0].subject_business_id, 11);
  assert.deepEqual(rows[0].outcome_type, { id: 3, code: 'completion', name: 'Completion' });
  assert.deepEqual(params[2], [11, null, 100]);
});

test('relationship and outcome data is not queried for non-members', async () => {
  const { pool, calls } = createPool(false);
  const repository = new PostgresRelationshipsOutcomesRepository(pool);
  await assert.rejects(() => repository.getBusinessRelationships(context, 11), /Business read permission required/);
  assert.equal(calls.some(sql => sql.includes('FROM ghm.business_relationship relationship')), false);
  const second = createPool(false);
  await assert.rejects(() => new PostgresRelationshipsOutcomesRepository(second.pool).getBusinessOutcomes(context, 11), /Business read permission required/);
  assert.equal(second.calls.some(sql => sql.includes('FROM ghm.outcome outcome')), false);
});

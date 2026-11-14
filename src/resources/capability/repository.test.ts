import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';
import { PgCapabilityRepository } from './repository';

const context: AuthContext = { userId: 99, role: 'admin' };
const row = {
  id: '11111111-1111-4111-8111-111111111111', parent_id: null,
  name: 'Building', slug: 'building', description: 'Built environment',
  sort_order: 5, lifecycle_status: 'draft', taxonomy_version: 1,
  effective_from: null, effective_to: null, source_authority: 'GHM System Administration',
  source_reference: 'policy-42', replaced_by_capability_id: null, is_selectable: false,
  created_at: new Date(1000), updated_at: new Date(1000),
};

const createPool = () => {
  const calls: string[] = [];
  const params: unknown[][] = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push(sql); params.push(values ?? []);
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 0, rows: [] };
      if (sql.includes('ghm.create_capability_draft')) return { rowCount: 1, rows: [row] };
      if (sql.includes('ghm.update_capability_draft')) return { rowCount: 1, rows: [row] };
      if (sql.includes('ghm.transition_capability_lifecycle')) return { rowCount: 1, rows: [{ ...row, lifecycle_status: 'active', is_selectable: true }] };
      if (sql.includes('FROM ghm.capability')) return { rowCount: 1, rows: [row] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const pool: TransactionPool = { async connect() { return client as unknown as PoolClient; } };
  return { pool, calls, params };
};

test('capability governance catalogue reads use canonical GHM rows', async () => {
  const { pool, calls } = createPool();
  const rows = await new PgCapabilityRepository(pool).listGoverned(context);
  assert.equal(rows[0].id, row.id);
  assert.equal(rows[0].lifecycleStatus, 'draft');
  assert.match(calls[1], /FROM ghm\.capability/);
});

test('capability draft creation invokes the protected database governance function', async () => {
  const { pool, calls, params } = createPool();
  const result = await new PgCapabilityRepository(pool).createDraft(context, {
    name: 'Building', slug: 'building', description: 'Built environment',
    parentId: null, sortOrder: 5, sourceReference: 'policy-42',
  });
  assert.equal(result.sourceAuthority, 'GHM System Administration');
  assert.match(calls[1], /ghm\.create_capability_draft/);
  assert.deepEqual(params[1], [99, 'Building', 'building', 'Built environment', null, 5, 'policy-42', 1]);
  assert.doesNotMatch(calls[1], /INSERT INTO ghm\.capability/);
});

test('capability draft update and lifecycle transition pass actor and version to protected functions', async () => {
  const { pool, calls, params } = createPool();
  const repository = new PgCapabilityRepository(pool);
  await repository.updateDraft(context, row.id, { name: 'Building', slug: 'building', sortOrder: 5 });
  await repository.transition(context, row.id, 'active');
  assert.match(calls[1], /ghm\.update_capability_draft/);
  assert.match(calls[4], /ghm\.transition_capability_lifecycle/);
  assert.equal(params[1][0], 99);
  assert.equal(params[1][1], row.id);
  assert.equal(params[1][8], 1);
  assert.deepEqual(params[4], [99, row.id, 'active', null, 1]);
});

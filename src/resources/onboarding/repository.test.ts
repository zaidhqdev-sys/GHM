import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';
import { PostgresOnboardingProgressRepository } from './repository';

const context: AuthContext = { userId: 77, role: 'customer' };
const row = {
  id: 1, account_id: 77, journey_id: 'business_setup_v1', step_id: 'profile', status: 'pending',
  first_started_at: new Date(1000), completed_at: null, dismissed_at: null,
  created_at: new Date(1000), updated_at: new Date(1000),
};

const createPool = (returnRow = row) => {
  const calls: string[] = [];
  const params: unknown[][] = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push(sql);
      params.push(values ?? []);
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO ghm.account_onboarding_progress') && sql.includes('DO NOTHING')) return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO ghm.account_onboarding_progress') && sql.includes('RETURNING')) return { rowCount: 1, rows: [returnRow] };
      if (sql.includes('SELECT id, account_id')) return { rowCount: 1, rows: [returnRow] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    release() {},
  };
  const pool: TransactionPool = { async connect() { return client as unknown as PoolClient; } };
  return { pool, calls, params };
};

test('onboarding progress reads are always scoped to the authenticated account', async () => {
  const { pool, calls, params } = createPool();
  const result = await new PostgresOnboardingProgressRepository(pool).getProgress(context, 'business_setup_v1');
  assert.equal(result[0].accountId, context.userId);
  assert.match(calls[1], /account_id = \$1/);
  assert.deepEqual(params[1], [77, 'business_setup_v1']);
});

test('onboarding start is idempotent and preserves an existing lifecycle state', async () => {
  const existing = { ...row, status: 'completed', completed_at: new Date(2000) };
  const { pool, calls, params } = createPool(existing);
  const result = await new PostgresOnboardingProgressRepository(pool).start(context, 'business_setup_v1', 'profile');
  assert.equal(result.status, 'completed');
  assert.match(calls[1], /ON CONFLICT .* DO NOTHING/s);
  assert.match(calls[2], /account_id = \$1 AND journey_id = \$2 AND step_id = \$3/);
  assert.deepEqual(params[1], [77, 'business_setup_v1', 'profile']);
});

test('onboarding completion and dismissal use database timestamps and mutually exclusive lifecycle fields', async () => {
  const completedPool = createPool({ ...row, status: 'completed', completed_at: new Date(2000) });
  const completed = await new PostgresOnboardingProgressRepository(completedPool.pool).complete(context, 'business_setup_v1', 'profile');
  assert.equal(completed.status, 'completed');
  assert.match(completedPool.calls[1], /completed_at = now\(\)/);
  assert.match(completedPool.calls[1], /dismissed_at = NULL/);

  const dismissedPool = createPool({ ...row, status: 'dismissed', dismissed_at: new Date(2000) });
  const dismissed = await new PostgresOnboardingProgressRepository(dismissedPool.pool).dismiss(context, 'business_setup_v1', 'profile');
  assert.equal(dismissed.status, 'dismissed');
  assert.match(dismissedPool.calls[1], /dismissed_at = now\(\)/);
  assert.match(dismissedPool.calls[1], /completed_at = NULL/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresBusinessAnalyticsRepository } from './repository';

test('requires owner/admin membership and active business.analytics entitlement before querying metrics', async () => {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 0, rows: [] };
      queries.push({ sql, values });
      if (queries.length === 1) return { rowCount: 1, rows: [{}] };
      return { rowCount: 1, rows: [{ dashboard: { business_id: 55, period_days: 30 } }] };
    },
    release: () => {},
  };
  const repository = new PostgresBusinessAnalyticsRepository({ connect: async () => client } as any);
  const result = await repository.getDashboard({ userId: 42, role: 'business' }, 55, 30);
  assert.equal(result.business_id, 55);
  assert.match(queries[0].sql, /membership_role IN \('owner', 'administrator'\)/);
  assert.match(queries[0].sql, /entitlement_code = 'business\.analytics'/);
  assert.deepEqual(queries[0].values, [55, 42]);
  assert.match(queries[1].sql, /FROM ghm\.business_engagement_event/);
  assert.match(queries[1].sql, /FROM ghm\.enquiry/);
  assert.match(queries[1].sql, /FROM ghm\.project_quote/);
});

test('does not query analytics data when entitlement or membership is absent', async () => {
  let calls = 0;
  const client = {
    query: async (sql: string) => { if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 0, rows: [] }; calls += 1; return { rowCount: 0, rows: [] }; },
    release: () => {},
  };
  const repository = new PostgresBusinessAnalyticsRepository({ connect: async () => client } as any);
  await assert.rejects(() => repository.getDashboard({ userId: 42, role: 'business' }, 55, 7), /Business analytics access required/);
  assert.equal(calls, 1);
});

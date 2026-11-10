import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresBusinessEngagementRepository } from './repository';

test('binds actor from verified auth context and only records publicly eligible businesses', async () => {
  let received: { sql: string; values?: unknown[] } | undefined;
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 0, rows: [] };
      if (sql.includes('count(*)::int AS total')) return { rowCount: 1, rows: [{ total: 0 }] };
      received = { sql, values };
      return { rowCount: 1, rows: [{ id: 1, business_id: 55, account_id: 42, event_type: 'profile_view', event_context: {}, source: 'web', created_at: new Date() }] };
    },
    release: () => {},
  };
  const repository = new PostgresBusinessEngagementRepository({ connect: async () => client } as any);
  const event = await repository.record({ userId: 42, role: 'customer' }, { businessId: 55, eventType: 'profile_view' });
  assert.equal(event.accountId, 42);
  assert.deepEqual(received?.values, [55, 42, 'profile_view', '{}', 'web']);
  assert.match(received?.sql ?? '', /is_verified = true/);
  assert.match(received?.sql ?? '', /NOT EXISTS/);
});


test('enforces per-account engagement write rate limit inside the transaction', async () => {
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rowCount: 0, rows: [] };
      statements.push(sql);
      if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 0, rows: [] };
      if (sql.includes('count(*)::int AS total')) return { rowCount: 1, rows: [{ total: 60 }] };
      throw new Error('event insert must not be reached');
    },
    release: () => {},
  };
  const repository = new PostgresBusinessEngagementRepository({ connect: async () => client } as any);
  await assert.rejects(() => repository.record({ userId: 42, role: 'customer' }, { businessId: 55, eventType: 'profile_view' }), /Engagement rate limit exceeded/);
  assert.equal(statements.some(sql => sql.includes('INSERT INTO ghm.business_engagement_event')), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresBusinessEngagementRepository } from './repository';

test('binds actor from verified auth context and only records publicly eligible businesses', async () => {
  let received: { sql: string; values?: unknown[] } | undefined;
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
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

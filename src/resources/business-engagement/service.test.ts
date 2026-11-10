import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessEngagementServiceImpl } from './service';
import type { BusinessEngagementRepository } from './contracts';

const context = { userId: 42, role: 'customer' as const };
const event = { id: 1, businessId: 55, accountId: 42, eventType: 'profile_view' as const, context: {}, source: 'web' as const, createdAt: new Date() };

test('records a bounded event using authenticated account context', async () => {
  let received: unknown;
  const repository = { record: async (auth: unknown, input: unknown) => { received = { auth, input }; return event; } } as unknown as BusinessEngagementRepository;
  const service = new BusinessEngagementServiceImpl(repository);
  assert.equal(await service.record(context, { businessId: 55, eventType: 'profile_view' }), event);
  assert.deepEqual(received, { auth: context, input: { businessId: 55, eventType: 'profile_view', context: {}, source: 'web' } });
});

test('rejects invalid event type, ID, source and context before persistence', async () => {
  let calls = 0;
  const repository = { record: async () => { calls += 1; return event; } } as unknown as BusinessEngagementRepository;
  const service = new BusinessEngagementServiceImpl(repository);
  await assert.rejects(() => service.record(context, { businessId: 0, eventType: 'profile_view' }), /businessId/i);
  await assert.rejects(() => service.record(context, { businessId: 55, eventType: 'unlisted' as any }), /Unsupported engagement/i);
  await assert.rejects(() => service.record(context, { businessId: 55, eventType: 'profile_view', source: 'server' as any }), /source/i);
  await assert.rejects(() => service.record(context, { businessId: 55, eventType: 'profile_view', context: { forbidden: 'value' } }), /context/i);
  await assert.rejects(() => service.record(context, { businessId: 55, eventType: 'profile_view', context: { visitor_id: 'x'.repeat(129) } }), /context/i);
  assert.equal(calls, 0);
});

test('rejects unauthenticated engagement writes', async () => {
  const service = new BusinessEngagementServiceImpl({ record: async () => event } as unknown as BusinessEngagementRepository);
  await assert.rejects(() => service.record(null as any, { businessId: 55, eventType: 'profile_view' }), /Authentication required/i);
});

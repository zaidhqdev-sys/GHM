import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessEngagementServiceImpl } from './service';
import type { AuthContext } from '../../auth/authorization';

const context: AuthContext = { userId: 12, role: 'customer' };

test('validates and records only supported event fields', async () => {
  let saved: any;
  const service = new BusinessEngagementServiceImpl({ record: async (_context, input) => {
    saved = input;
    return { id: 1, businessId: input.businessId, accountId: 12, eventType: input.eventType, context: input.context ?? {}, source: input.source ?? 'web', createdAt: new Date() };
  } });
  await service.record(context, { businessId: 42, eventType: 'profile_view', context: { visitor_id: 'anon-123' } });
  assert.deepEqual(saved.context, { visitor_id: 'anon-123' });
  await assert.rejects(() => service.record(context, { businessId: 42, eventType: 'admin_grant' as any }), /Unsupported engagement event type/);
  await assert.rejects(() => service.record(context, { businessId: 42, eventType: 'profile_view', context: { email: 'x@y.test' } }), /Invalid engagement context/);
  await assert.rejects(() => service.record(context, { businessId: 0, eventType: 'profile_view' }), /businessId must be a positive integer/);
});

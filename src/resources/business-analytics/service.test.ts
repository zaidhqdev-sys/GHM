import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { BusinessAnalyticsRepository, RecordBusinessEngagementInput } from './contracts';
import { BusinessAnalyticsService } from './service';

const owner: AuthContext = { userId: 42, role: 'business' };
const dashboard = {
  business_id: 20, period_days: 30 as const,
  engagement: { profile_views: 3, calls: 2, whatsapp_clicks: 1 },
  leads: 4, quotes: 2, projects_won: 1, conversion_rate: 25,
  recent_activity: [],
};
const repository = (overrides: Partial<BusinessAnalyticsRepository> = {}): BusinessAnalyticsRepository => ({
  recordEngagementEvent: async (_context, input) => ({
    id: 1, businessId: input.businessId, eventType: input.eventType, occurredAt: new Date('2026-11-25T00:00:00Z'),
  }),
  getDashboard: async () => dashboard,
  ...overrides,
});

test('records only allowlisted event types with bounded context and source', async () => {
  let received: RecordBusinessEngagementInput | undefined;
  const service = new BusinessAnalyticsService(repository({
    recordEngagementEvent: async (_context, input) => {
      received = input;
      return { id: 7, businessId: input.businessId, eventType: input.eventType, occurredAt: new Date() };
    },
  }));
  const input = { businessId: 20, eventType: 'profile_view' as const, context: { visitor_id: 'visitor-1' }, source: 'web' as const };
  const result = await service.recordEngagementEvent(null, input);
  assert.equal(result?.businessId, 20);
  assert.deepEqual(received, input);
});

test('rejects unsupported event, source and context keys', async () => {
  const service = new BusinessAnalyticsService(repository());
  await assert.rejects(() => service.recordEngagementEvent(null, { businessId: 20, eventType: 'purchase' as never, context: {}, source: 'web' }), /Invalid engagement event type/);
  await assert.rejects(() => service.recordEngagementEvent(null, { businessId: 20, eventType: 'call', context: {}, source: 'server' as never }), /Invalid engagement event source/);
  await assert.rejects(() => service.recordEngagementEvent(null, { businessId: 20, eventType: 'call', context: { account_id: '999' }, source: 'web' }), /Invalid engagement event context/);
});

test('analytics requires authentication and accepts only 7, 30 or 90 days', async () => {
  const service = new BusinessAnalyticsService(repository());
  await assert.rejects(() => service.getDashboard({ userId: 0, role: 'business' }, 20, 30), /Authentication required/);
  await assert.rejects(() => service.getDashboard(owner, 20, 14), /Analytics period must be 7, 30, or 90 days/);
  assert.deepEqual(await service.getDashboard(owner, 20, 30), dashboard);
});

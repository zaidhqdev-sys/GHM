import assert from 'node:assert/strict';
import test from 'node:test';
import { BusinessAnalyticsServiceImpl } from './service';
import type { BusinessAnalyticsRepository } from './contracts';

const dashboard = { version: 1 as const, business_id: 55, period_days: 30 as const, generated_at: new Date(), engagement: {}, leads: 0, quotes: 0, projects_won: 0, conversion_rate: 0, recent_activity: [] };
test('loads a bounded analytics dashboard for authenticated context', async () => {
  let received: unknown;
  const repository = { getDashboard: async (...args: unknown[]) => { received = args; return dashboard; } } as unknown as BusinessAnalyticsRepository;
  const service = new BusinessAnalyticsServiceImpl(repository);
  assert.equal(await service.getDashboard({ userId: 42, role: 'business' }, 55, 30), dashboard);
  assert.deepEqual(received, [{ userId: 42, role: 'business' }, 55, 30]);
});
test('rejects invalid business IDs and periods before repository access', async () => {
  let calls = 0;
  const service = new BusinessAnalyticsServiceImpl({ getDashboard: async () => { calls += 1; return dashboard; } } as unknown as BusinessAnalyticsRepository);
  await assert.rejects(() => service.getDashboard({ userId: 42, role: 'business' }, 0, 30), /businessId/i);
  await assert.rejects(() => service.getDashboard({ userId: 42, role: 'business' }, 55, 14 as any), /7, 30, or 90/);
  await assert.rejects(() => service.getDashboard(null as any, 55, 30), /Authentication required/);
  assert.equal(calls, 0);
});

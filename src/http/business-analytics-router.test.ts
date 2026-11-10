import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { BusinessAnalyticsService } from '../resources/business-analytics/contracts';

const start = async (service: BusinessAnalyticsService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, businessAnalyticsService: service }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

test('analytics read requires authentication', async () => {
  const service = { getDashboard: async () => { throw new Error('must not be called'); } } as unknown as BusinessAnalyticsService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/analytics?days=30`);
    assert.equal(response.status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('analytics read validates IDs and supported periods before service access', async () => {
  let calls = 0;
  const service = { getDashboard: async () => { calls += 1; return {}; } } as unknown as BusinessAnalyticsService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` };
    for (const path of ['/api/v1/businesses/055/analytics?days=30', '/api/v1/businesses/55/analytics?days=14']) {
      const response = await fetch(`${baseUrl}${path}`, { headers });
      assert.equal(response.status, 400);
    }
    assert.equal(calls, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('analytics read binds GHM identity and returns the dashboard projection', async () => {
  let received: unknown;
  const dashboard = { version: 1, business_id: 55, period_days: 7, engagement: {}, leads: 2, quotes: 1, projects_won: 1, conversion_rate: 50, recent_activity: [] };
  const service = { getDashboard: async (...args: unknown[]) => { received = args; return dashboard; } } as unknown as BusinessAnalyticsService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/analytics?days=7`, { headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(received, [{ userId: 42, role: 'business' }, 55, 7]);
    assert.deepEqual(await response.json(), { analytics: dashboard });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

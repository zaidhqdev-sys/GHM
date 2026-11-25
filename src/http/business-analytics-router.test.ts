import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';
import type { BusinessAnalyticsService } from '../resources/business-analytics/service';

const start = async (service: BusinessAnalyticsService) => {
  const server = http.createServer(createApp({
    resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    businessAnalyticsService: service,
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const dashboard = {
  business_id: 20, period_days: 30,
  engagement: { profile_views: 3, calls: 2, whatsapp_clicks: 1 },
  leads: 4, quotes: 2, projects_won: 1, conversion_rate: 25,
  recent_activity: [],
};

test('analytics endpoint binds authenticated GHM context and bounded period', async () => {
  let received: unknown;
  const service = {
    getDashboard: async (context: unknown, businessId: number, days: number) => {
      received = { context, businessId, days };
      return dashboard;
    },
  } as unknown as BusinessAnalyticsService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/20/analytics?days=30`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { context: { userId: 42, role: 'business' }, businessId: 20, days: 30 });
    assert.deepEqual(await response.json(), { analytics: dashboard });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('analytics endpoint rejects invalid business and period before service execution', async () => {
  let called = false;
  const service = { getDashboard: async () => { called = true; return dashboard; } } as unknown as BusinessAnalyticsService;
  const { server, baseUrl } = await start(service);
  try {
    const invalidId = await fetch(`${baseUrl}/api/v1/businesses/nope/analytics`, { headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` } });
    const invalidPeriod = await fetch(`${baseUrl}/api/v1/businesses/20/analytics?days=14`, { headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` } });
    assert.equal(invalidId.status, 400);
    assert.equal(invalidPeriod.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('engagement endpoint permits anonymous events but derives authenticated actor only from verified middleware', async () => {
  const received: unknown[] = [];
  const service = {
    recordEngagementEvent: async (context: unknown, input: unknown) => {
      received.push({ context, input });
      return { id: received.length, businessId: 20, eventType: 'call', occurredAt: new Date('2026-11-25T00:00:00Z') };
    },
  } as unknown as BusinessAnalyticsService;
  const { server, baseUrl } = await start(service);
  try {
    const payload = { businessId: 20, eventType: 'call', source: 'web', context: {} };
    const anonymous = await fetch(`${baseUrl}/api/v1/business-engagement-events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(anonymous.status, 201);
    const authenticated = await fetch(`${baseUrl}/api/v1/business-engagement-events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
      body: JSON.stringify(payload),
    });
    assert.equal(authenticated.status, 201);
    assert.deepEqual(received.map(x => (x as { context: unknown }).context), [null, { userId: 42, role: 'business' }]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('engagement endpoint rejects malformed event payloads', async () => {
  let called = false;
  const service = { recordEngagementEvent: async () => { called = true; return null; } } as unknown as BusinessAnalyticsService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-engagement-events`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ businessId: 0, eventType: 'call', source: 'web', context: {} }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

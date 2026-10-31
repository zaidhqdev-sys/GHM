import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { AuthContext } from '../auth/authorization';
import type { BusinessEngagementService, BusinessEngagementEvent } from '../resources/business-engagement/contracts';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';

const startServer = async (service: BusinessEngagementService) => {
  const server = http.createServer(createApp({
    resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    businessEngagementService: service,
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const event = (context: AuthContext): BusinessEngagementEvent => ({
  id: 7, businessId: 42, accountId: context.userId, eventType: 'profile_view',
  context: { visitor_id: 'visitor-1' }, source: 'web', createdAt: new Date('2026-10-19T00:00:00Z'),
});

test('business engagement route requires authentication', async () => {
  const service = { record: async () => { throw new Error('must not be called'); } } as unknown as BusinessEngagementService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-engagement-events`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ businessId: 42, eventType: 'profile_view' }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('business engagement route binds event to authenticated account context', async () => {
  let received: { context: AuthContext; input: unknown } | undefined;
  const service = { record: async (context: AuthContext, input: unknown) => {
    received = { context, input };
    return event(context);
  } } as unknown as BusinessEngagementService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-engagement-events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ businessId: 42, eventType: 'profile_view', context: { visitor_id: 'visitor-1' }, source: 'web' }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(received?.context, { userId: 9, role: 'customer' });
    assert.deepEqual(received?.input, { businessId: 42, eventType: 'profile_view', context: { visitor_id: 'visitor-1' }, source: 'web' });
    assert.equal((await response.json() as { event: BusinessEngagementEvent }).event.accountId, 9);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('business engagement route rejects unexpected fields before calling service', async () => {
  let called = false;
  const service = { record: async () => { called = true; return event({ userId: 9, role: 'customer' }); } } as unknown as BusinessEngagementService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-engagement-events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ businessId: 42, eventType: 'profile_view', accountId: 1 }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

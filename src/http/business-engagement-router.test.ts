import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { BusinessEngagementService } from '../resources/business-engagement/contracts';

const start = async (service: BusinessEngagementService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, businessEngagementService: service }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

test('engagement writes require authentication', async () => {
  const service = { record: async () => { throw new Error('must not be called'); } } as unknown as BusinessEngagementService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-engagement-events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ businessId: 55, eventType: 'profile_view' }) });
    assert.equal(response.status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('engagement write validates the bounded request and uses auth context', async () => {
  let received: unknown;
  const service = { record: async (context: unknown, input: unknown) => { received = { context, input }; return { id: 1, businessId: 55, accountId: 42, eventType: 'profile_view', context: {}, source: 'web', createdAt: new Date('2026-11-10T00:00:00Z') }; } } as unknown as BusinessEngagementService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' };
    const invalid = await fetch(`${baseUrl}/api/v1/business-engagement-events`, { method: 'POST', headers, body: JSON.stringify({ businessId: 55, eventType: 'unknown' }) });
    assert.equal(invalid.status, 400);
    const response = await fetch(`${baseUrl}/api/v1/business-engagement-events`, { method: 'POST', headers, body: JSON.stringify({ businessId: 55, eventType: 'profile_view', context: { surface: 'directory' } }) });
    assert.equal(response.status, 201);
    assert.deepEqual(received, { context: { userId: 42, role: 'customer' }, input: { businessId: 55, eventType: 'profile_view', context: { surface: 'directory' }, source: undefined } });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { CommercialAccess, CommercialService, CommercialSubscription } from '../resources/commercial/contracts';

const start = async (service: CommercialService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, commercialService: service }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const access: CommercialAccess = {
  businessId: 55,
  subscriptionId: 12,
  status: 'active',
  currentPeriodStart: new Date('2026-11-01T00:00:00.000Z'),
  currentPeriodEnd: new Date('2026-12-01T00:00:00.000Z'),
  cancelAtPeriodEnd: false,
  foundingProtectedUntil: null,
  entitlements: [{ code: 'quote_management', accessLevel: 'enabled', metadata: {} }],
  evaluatedAt: new Date('2026-11-10T00:00:00.000Z'),
};

const subscription: CommercialSubscription = {
  id: 12,
  businessId: 55,
  planVersionId: 3,
  priceId: 4,
  trialId: null,
  lifecycleStatus: 'active',
  currentPeriodStart: access.currentPeriodStart,
  currentPeriodEnd: access.currentPeriodEnd,
  cancelAtPeriodEnd: false,
  cancelledAt: null,
  foundingSequence: null,
  foundingProtectedUntil: null,
  providerReference: null,
  createdAt: new Date('2026-11-01T00:00:00.000Z'),
  updatedAt: new Date('2026-11-01T00:00:00.000Z'),
};

test('commercial access read requires GHM authentication', async () => {
  const service = {
    getCommercialAccess: async () => { throw new Error('must not be called'); },
    getCommercialSubscription: async () => { throw new Error('must not be called'); },
  } as unknown as CommercialService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/commercial/access/55`);
    assert.equal(response.status, 401);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('commercial access read validates canonical positive Business IDs before service access', async () => {
  let calls = 0;
  const service = {
    getCommercialAccess: async () => { calls += 1; return access; },
    getCommercialSubscription: async () => { calls += 1; return subscription; },
  } as unknown as CommercialService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` };
    for (const id of ['0', '055', '-1', '1.5', '9007199254740992']) {
      const response = await fetch(`${baseUrl}/api/v1/commercial/access/${id}`, { headers });
      assert.equal(response.status, 400);
    }
    assert.equal(calls, 0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('commercial access read derives actor from GHM auth context and returns canonical access', async () => {
  let received: unknown;
  const service = {
    getCommercialAccess: async (...args: unknown[]) => { received = args; return access; },
    getCommercialSubscription: async () => null,
  } as unknown as CommercialService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` };
    const response = await fetch(`${baseUrl}/api/v1/commercial/access/55`, { headers });
    assert.equal(response.status, 200);
    const body = await response.json() as { result: { businessId: number; currentPeriodStart: string; currentPeriodEnd: string; entitlements: Array<{ code: string }> } };
    assert.equal(body.result.businessId, 55);
    assert.equal(body.result.currentPeriodStart, access.currentPeriodStart?.toISOString());
    assert.equal(body.result.currentPeriodEnd, access.currentPeriodEnd?.toISOString());
    assert.equal(body.result.entitlements[0]?.code, 'quote_management');
    assert.deepEqual(received, [{ userId: 42, role: 'business' }, 55]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('commercial subscription read returns null when no subscription exists', async () => {
  let received: unknown;
  const service = {
    getCommercialAccess: async () => access,
    getCommercialSubscription: async (...args: unknown[]) => { received = args; return null; },
  } as unknown as CommercialService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` };
    const response = await fetch(`${baseUrl}/api/v1/commercial/subscription/55`, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: null });
    assert.deepEqual(received, [{ userId: 42, role: 'customer' }, 55]);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('commercial reads do not disclose Businesses without active membership', async () => {
  const service = {
    getCommercialAccess: async () => { throw new Error('Business read permission required'); },
    getCommercialSubscription: async () => { throw new Error('Business read permission required'); },
  } as unknown as CommercialService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` };
    const response = await fetch(`${baseUrl}/api/v1/commercial/access/55`, { headers });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

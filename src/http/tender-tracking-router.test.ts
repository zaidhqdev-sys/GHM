import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';
import { HttpTenderTrackingGatewayClient, TenderTrackingGatewayError, type TenderTrackingGatewayClient } from './tender-tracking-gateway-client';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';

// Fake Gateway client / fake fetch. No database is reachable from the Resource API for
// tender data: there is no direct-database path to test, and none is implemented.
const rec = { id: 7, businessId: 3, title: 'T', referenceNumber: null, issuerName: null, sourceUrl: null, sourceUrlVerified: false as const,
  closingAt: null, stage: 'saved' as const, createdBy: 9, updatedBy: 9, createdAt: 'x', updatedAt: 'x', archivedAt: null };

const start = async (client?: TenderTrackingGatewayClient) => {
  const server = http.createServer(createApp({
    resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    tenderTrackingGatewayClient: client,
  }));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
};
const stop = (s: http.Server) => new Promise<void>(r => s.close(() => r()));
const B = '/api/v1/businesses/3/tenders/tracking';
const auth = (role: 'admin' | 'business' | 'customer' = 'business') => ({ authorization: `Bearer ${tokenFor({ userId: 42, role })}` });
const recorder = () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const mk = (method: string, out: unknown) => async (...args: unknown[]) => { calls.push({ method, args }); return out; };
  const client = {
    create: mk('create', rec), list: mk('list', { items: [rec], nextAfter: null }), get: mk('get', rec), update: mk('update', rec),
    archive: mk('archive', { ...rec, stage: 'archived', archivedAt: 'y' }), remove: mk('remove', { id: 7, businessId: 3, deleted: true }),
  } as unknown as TenderTrackingGatewayClient;
  return { calls, client };
};

test('registry and role policy: customers have no tender tracking resource; archive is a registered operation', () => {
  assert.equal(canAccessResource({ userId: 1, role: 'customer' }, 'tender_tracking'), false);
  assert.equal(canAccessResource({ userId: 1, role: 'business' }, 'tender_tracking'), true);
  assert.equal(canAccessResource({ userId: 1, role: 'admin' }, 'tender_tracking'), true);
  for (const op of ['read', 'create', 'update', 'archive', 'delete'] as const) assert.ok(isRegisteredOperation('tender_tracking', op), op);
});

test('unauthenticated requests are 401 and customers 403 before any Gateway call', async () => {
  const { calls, client } = recorder();
  const { server, url } = await start(client);
  try {
    assert.equal((await fetch(`${url}${B}`)).status, 401);
    assert.equal((await fetch(`${url}${B}`, { headers: auth('customer') })).status, 403);
    assert.equal(calls.length, 0);
  } finally { await stop(server); }
});

test('forwards only the caller token and path business id; a client-supplied actor/business/role never reaches the Gateway', async () => {
  const { calls, client } = recorder();
  const { server, url } = await start(client);
  try {
    const bad = await fetch(`${url}${B}`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body: JSON.stringify({ title: 'T', businessId: 99, actorAccountId: 1, role: 'owner' }) });
    assert.equal(bad.status, 400);
    assert.equal(calls.length, 0);
    const ok = await fetch(`${url}${B}`, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json', 'x-actor-account-id': '1', 'x-business-id': '99' }, body: JSON.stringify({ title: 'T' }) });
    assert.equal(ok.status, 201);
    assert.equal(calls[0]!.args[1], 3);
    assert.match(calls[0]!.args[0] as string, /^ey/); // the caller's own bearer token
  } finally { await stop(server); }
});

test('all six operations route to the Gateway client and return validated shapes', async () => {
  const { calls, client } = recorder();
  const { server, url } = await start(client);
  const json = { 'content-type': 'application/json' };
  try {
    assert.equal((await fetch(`${url}${B}?limit=10`, { headers: auth() })).status, 200);
    assert.equal((await fetch(`${url}${B}/7`, { headers: auth() })).status, 200);
    assert.equal((await fetch(`${url}${B}/7`, { method: 'PATCH', headers: { ...auth(), ...json }, body: JSON.stringify({ stage: 'evaluating' }) })).status, 200);
    assert.equal((await fetch(`${url}${B}/7/archive`, { method: 'POST', headers: auth() })).status, 200);
    const del = await fetch(`${url}${B}/7`, { method: 'DELETE', headers: auth() });
    assert.equal(del.status, 200);
    assert.deepEqual(await del.json(), { deleted: { id: 7, businessId: 3, deleted: true } });
    assert.deepEqual(calls.map(c => c.method), ['list', 'get', 'update', 'archive', 'remove']);
  } finally { await stop(server); }
});

test('malformed input is rejected locally (400) without reaching the Gateway', async () => {
  const { calls, client } = recorder();
  const { server, url } = await start(client);
  const json = { 'content-type': 'application/json' };
  try {
    for (const p of ['/api/v1/businesses/abc/tenders/tracking', `${B}/0`, `${B}/01`, `${B}?limit=999`, `${B}?stage=won`]) {
      assert.equal((await fetch(`${url}${p}`, { headers: auth() })).status, 400, p);
    }
    assert.equal((await fetch(`${url}${B}/7`, { method: 'PATCH', headers: { ...auth(), ...json }, body: JSON.stringify({ stage: 'archived' }) })).status, 400);
    assert.equal((await fetch(`${url}${B}/7/archive`, { method: 'POST', headers: { ...auth(), ...json }, body: JSON.stringify({ x: 1 }) })).status, 400);
    assert.equal(calls.length, 0);
  } finally { await stop(server); }
});

test('Gateway statuses are mapped; anything else is a generic 503', async () => {
  for (const [status, expected] of [[401, 401], [403, 403], [404, 404], [409, 409], [429, 429], [400, 400], [500, 503], [502, 503]] as const) {
    const client = { get: async () => { throw new TenderTrackingGatewayError(status); } } as unknown as TenderTrackingGatewayClient;
    const { server, url } = await start(client);
    try {
      const r = await fetch(`${url}${B}/7`, { headers: auth() });
      assert.equal(r.status, expected, String(status));
      assert.doesNotMatch(await r.text(), /gateway|stack/i);
    } finally { await stop(server); }
  }
});

test('with no Gateway client configured every route is 503: there is no direct-database fallback', async () => {
  const { server, url } = await start(undefined);
  try {
    assert.equal((await fetch(`${url}${B}`, { headers: auth() })).status, 503);
    assert.equal((await fetch(`${url}${B}/7`, { method: 'DELETE', headers: auth() })).status, 503);
  } finally { await stop(server); }
});

test('only a UUID x-request-id is forwarded as correlation; anything else is dropped', async () => {
  const { calls, client } = recorder();
  const { server, url } = await start(client);
  try {
    await fetch(`${url}${B}/7`, { headers: { ...auth(), 'x-request-id': '55555555-5555-4555-8555-555555555555' } });
    await fetch(`${url}${B}/7`, { headers: { ...auth(), 'x-request-id': 'abc' } });
    assert.equal(calls[0]!.args[3], '55555555-5555-4555-8555-555555555555');
    assert.equal(calls[1]!.args[3], null);
  } finally { await stop(server); }
});

test('HTTP client: forwards bearer, refuses redirects, validates responses, rejects non-HTTPS non-allowed base URLs', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = (async (u: string, init: RequestInit) => { seen.push({ url: u, init }); return new Response(JSON.stringify({ tracking: rec }), { status: 200 }); }) as unknown as typeof fetch;
  const c = new HttpTenderTrackingGatewayClient('https://gateway.example.test', 1000, fakeFetch);
  await c.get('tok', 3, 7, '66666666-6666-4666-8666-666666666666');
  assert.equal(seen[0]!.url, 'https://gateway.example.test/v1/businesses/3/tenders/tracking/7');
  assert.equal(seen[0]!.init.redirect, 'error');
  const headers = seen[0]!.init.headers as Record<string, string>;
  assert.equal(headers.authorization, 'Bearer tok');
  assert.equal(headers['x-request-id'], '66666666-6666-4666-8666-666666666666');
  await assert.rejects(c.get('  ', 3, 7, null));
  const garbage = new HttpTenderTrackingGatewayClient('https://gateway.example.test', 1000, (async () => new Response(JSON.stringify({ tracking: { ...rec, evil: 1 } }), { status: 200 })) as unknown as typeof fetch);
  await assert.rejects(garbage.get('t', 3, 7, null), /invalid/);
  const denied = new HttpTenderTrackingGatewayClient('https://gateway.example.test', 1000, (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch);
  await assert.rejects(denied.get('t', 3, 7, null), (e: TenderTrackingGatewayError) => e.status === 403);
  assert.throws(() => new HttpTenderTrackingGatewayClient('http://evil.example.test'));
});

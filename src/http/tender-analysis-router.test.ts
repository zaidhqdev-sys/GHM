import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';
import { HttpTenderAnalysisGatewayClient, TenderAnalysisGatewayError, type TenderAnalysisGatewayClient } from './tender-analysis-gateway-client';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';
import { fixtureBody, metadataOf, recordFor, validInput } from '../tender/analysis-test-fixtures';

// Fake Gateway client / fake fetch. No database is reachable from the Resource API for tender data:
// there is no direct-database path to test, and none is implemented.
const rec = recordFor(validInput());
const start = async (client?: TenderAnalysisGatewayClient) => {
  const server = http.createServer(createApp({
    resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    tenderAnalysisGatewayClient: client,
  }));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
};
const stop = (s: http.Server) => new Promise<void>(r => s.close(() => r()));
const B = '/api/v1/businesses/3/tenders/analyses';
const auth = (role: 'admin' | 'business' | 'customer' = 'business') => ({ authorization: `Bearer ${tokenFor({ userId: 42, role })}` });
const json = { 'content-type': 'application/json' };
const recorder = () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const mk = (method: string, out: unknown) => async (...args: unknown[]) => { calls.push({ method, args }); return out; };
  const client = {
    create: mk('create', rec), list: mk('list', { items: [metadataOf(rec)], nextAfter: null }), get: mk('get', rec),
    remove: mk('remove', { id: 11, businessId: 3, deleted: true }),
  } as unknown as TenderAnalysisGatewayClient;
  return { calls, client };
};

test('registry and role policy: customers have no saved-analysis resource; delete is registered, update/archive are not', () => {
  assert.equal(canAccessResource({ userId: 1, role: 'customer' }, 'tender_analysis'), false);
  assert.equal(canAccessResource({ userId: 1, role: 'business' }, 'tender_analysis'), true);
  assert.equal(canAccessResource({ userId: 1, role: 'admin' }, 'tender_analysis'), true);
  for (const op of ['read', 'create', 'delete'] as const) assert.ok(isRegisteredOperation('tender_analysis', op), op);
  for (const op of ['update', 'archive'] as const) assert.ok(!isRegisteredOperation('tender_analysis', op), op);
});

test('unauthenticated is 401 and customers 403 before any Gateway call', async () => {
  const { calls, client } = recorder();
  const { server, url } = await start(client);
  try {
    assert.equal((await fetch(`${url}${B}`)).status, 401);
    assert.equal((await fetch(`${url}${B}`, { headers: auth('customer') })).status, 403);
    assert.equal(calls.length, 0);
  } finally { await stop(server); }
});

test('forwards only the caller token and the path business id; client-supplied actor/business/role never reaches the Gateway', async () => {
  const { calls, client } = recorder();
  const { server, url } = await start(client);
  try {
    const body = fixtureBody('valid complete, three chunks');
    for (const extra of [{ businessId: 99 }, { accountId: 1 }, { role: 'owner' }, { createdBy: 1 }]) {
      const bad = await fetch(`${url}${B}`, { method: 'POST', headers: { ...auth(), ...json }, body: JSON.stringify({ ...body, ...extra }) });
      assert.equal(bad.status, 400);
    }
    assert.equal(calls.length, 0);
    const ok = await fetch(`${url}${B}`, { method: 'POST', headers: { ...auth(), ...json, 'x-actor-account-id': '1', 'x-business-id': '99' }, body: JSON.stringify(body) });
    assert.equal(ok.status, 201);
    assert.equal(calls[0]!.args[1], 3);
    assert.match(calls[0]!.args[0] as string, /^ey/);
  } finally { await stop(server); }
});

test('all four operations route to the Gateway client; reads return validated shapes', async () => {
  const { calls, client } = recorder();
  const { server, url } = await start(client);
  try {
    assert.equal((await fetch(`${url}${B}?limit=10`, { headers: auth() })).status, 200);
    const got = await fetch(`${url}${B}/11`, { headers: auth() });
    assert.equal(got.status, 200);
    assert.equal(((await got.json()) as { analysis: { id: number } }).analysis.id, 11);
    const del = await fetch(`${url}${B}/11`, { method: 'DELETE', headers: auth() });
    assert.deepEqual(await del.json(), { deleted: { id: 11, businessId: 3, deleted: true } });
    assert.equal((await fetch(`${url}${B}`, { method: 'POST', headers: { ...auth(), ...json }, body: JSON.stringify(fixtureBody('valid incomplete, middle part unavailable')) })).status, 201);
    assert.deepEqual(calls.map(c => c.method), ['list', 'get', 'remove', 'create']);
  } finally { await stop(server); }
});

test('refusals happen locally with no Gateway call: invalid 400, unsupported 422, oversized 413', async () => {
  const { calls, client } = recorder();
  const { server, url } = await start(client);
  const post = (body: unknown) => fetch(`${url}${B}`, { method: 'POST', headers: { ...auth(), ...json }, body: JSON.stringify(body) });
  try {
    assert.equal((await post(fixtureBody('coverage: complete but a part unprocessed'))).status, 400);
    assert.equal((await post(fixtureBody('evidence: start inside an unread part'))).status, 400);
    const unsupported = await post(fixtureBody('unsupported: coverage status unsupported'));
    assert.equal(unsupported.status, 422);
    assert.deepEqual(await unsupported.json(), { error: 'unsupported' });
    assert.equal((await post(fixtureBody('oversized: result above 12 KiB, request within 16 KiB'))).status, 413);
    for (const p of ['/api/v1/businesses/abc/tenders/analyses', `${B}/0`, `${B}/01`, `${B}?limit=999`]) {
      assert.equal((await fetch(`${url}${p}`, { headers: auth() })).status, 400, p);
    }
    assert.equal(calls.length, 0);
  } finally { await stop(server); }
});

test('Gateway statuses are mapped (incl. 413 and 422); anything else is a generic 503', async () => {
  for (const [status, expected] of [[401, 401], [403, 403], [404, 404], [409, 409], [413, 413], [422, 422], [429, 429], [400, 400], [500, 503], [502, 503]] as const) {
    const client = { get: async () => { throw new TenderAnalysisGatewayError(status); } } as unknown as TenderAnalysisGatewayClient;
    const { server, url } = await start(client);
    try {
      const r = await fetch(`${url}${B}/11`, { headers: auth() });
      assert.equal(r.status, expected, String(status));
      assert.doesNotMatch(await r.text(), /gateway|stack/i);
    } finally { await stop(server); }
  }
});

test('with no Gateway client configured every route is 503: there is no direct-database fallback', async () => {
  const { server, url } = await start(undefined);
  try {
    assert.equal((await fetch(`${url}${B}`, { headers: auth() })).status, 503);
    assert.equal((await fetch(`${url}${B}/11`, { method: 'DELETE', headers: auth() })).status, 503);
  } finally { await stop(server); }
});

test('only a UUID x-request-id is forwarded as correlation', async () => {
  const { calls, client } = recorder();
  const { server, url } = await start(client);
  try {
    await fetch(`${url}${B}/11`, { headers: { ...auth(), 'x-request-id': '55555555-5555-4555-8555-555555555555' } });
    await fetch(`${url}${B}/11`, { headers: { ...auth(), 'x-request-id': 'abc' } });
    assert.equal(calls[0]!.args[3], '55555555-5555-4555-8555-555555555555');
    assert.equal(calls[1]!.args[3], null);
  } finally { await stop(server); }
});

test('HTTP client: forwards bearer, refuses redirects, sends trackingId as a string, validates responses against version 2', async () => {
  const seen: Array<{ url: string; init: RequestInit }> = [];
  const respond = (body: unknown, status = 200) => (async (u: string, init: RequestInit) => { seen.push({ url: u, init }); return new Response(JSON.stringify(body), { status }); }) as unknown as typeof fetch;
  const input = validInput('valid complete, with tracking id');
  const c = new HttpTenderAnalysisGatewayClient('https://gateway.example.test', 1000, respond({ analysis: recordFor(input) }));
  await c.create('tok', 3, input, '66666666-6666-4666-8666-666666666666');
  assert.equal(seen[0]!.url, 'https://gateway.example.test/v1/businesses/3/tenders/analyses');
  assert.equal(seen[0]!.init.redirect, 'error');
  const headers = seen[0]!.init.headers as Record<string, string>;
  assert.equal(headers.authorization, 'Bearer tok');
  assert.equal(headers['x-request-id'], '66666666-6666-4666-8666-666666666666');
  const sent = JSON.parse(seen[0]!.init.body as string) as Record<string, unknown>;
  assert.equal(sent.trackingId, '123');
  assert.deepEqual(Object.keys(sent).sort(), ['documentHashVersion', 'documentSha256', 'model', 'promptVersion', 'result', 'trackingId']);
  await assert.rejects(c.get('  ', 3, 11, null));

  const flipped = structuredClone(recordFor(validInput('valid incomplete, middle part unavailable')));
  (flipped.result as { coverage: { status: string } }).coverage.status = 'complete';
  for (const bad of [{ analysis: flipped }, { analysis: { ...rec, extra: 1 } }, { analysis: { ...rec, source: 'x' } }, {}]) {
    const g = new HttpTenderAnalysisGatewayClient('https://gateway.example.test', 1000, respond(bad));
    await assert.rejects(g.get('t', 3, 11, null), /invalid/);
  }
  const denied = new HttpTenderAnalysisGatewayClient('https://gateway.example.test', 1000, respond({}, 403));
  await assert.rejects(denied.get('t', 3, 11, null), (e: TenderAnalysisGatewayError) => e.status === 403);
  assert.throws(() => new HttpTenderAnalysisGatewayClient('http://evil.example.test'));
});

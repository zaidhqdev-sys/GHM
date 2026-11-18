import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { ACCESS_JWT_AUD, ACCESS_JWT_ISS, createAccessJwtVerifier } from '../auth/foundation/access-jwt-verifier';
import { createActorGatewayApp } from './app';
import { TenderGatewayContractError, type TenderTrackingGatewayReader } from './tender-tracking-reader';
import { TenderOperationLogger } from './tender-request-context';

// Fake reader: proves routing, strict input, id handling, error mapping and logging.
// Authorization itself lives in SQL and has NOT been executed against PostgreSQL.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const kid = 'tender-test-1';
const verifier = createAccessJwtVerifier(new Map([[kid, publicKey.export({ type: 'spki', format: 'pem' }).toString()]]));
const token = (account: number): string => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ sub: String(account), iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: now, exp: now + 900 },
    privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { algorithm: 'ES256', keyid: kid });
};
const rec = (over: Record<string, unknown> = {}) => ({
  id: 7, businessId: 3, title: 'T', referenceNumber: null, issuerName: null, sourceUrl: null, sourceUrlVerified: false as const,
  closingAt: null, stage: 'saved' as const, createdBy: 9, updatedBy: 9, createdAt: 'x', updatedAt: 'x', archivedAt: null, ...over,
});

interface Seen { method: string; actor: number; businessId: number; args: unknown[]; ids?: unknown }
const harness = async (
  behaviour: (m: string) => unknown,
  work: (url: string, seen: Seen[], logs: string[]) => Promise<void>,
  opts: { reader?: boolean; limit?: number } = {},
): Promise<void> => {
  const seen: Seen[] = [];
  const logs: string[] = [];
  const wrap = (method: string) => async (actor: number, businessId: number, ...args: unknown[]) => {
    const maybeIds = args.at(-1);
    seen.push({ method, actor, businessId, args, ids: maybeIds });
    const out = behaviour(method);
    if (out instanceof Error) throw out;
    return out;
  };
  const reader = {
    create: wrap('create'), list: wrap('list'), get: wrap('get'), update: wrap('update'), archive: wrap('archive'), remove: wrap('remove'),
  } as unknown as TenderTrackingGatewayReader;
  const server = http.createServer(createActorGatewayApp({
    verifier,
    actorIdentityReader: {} as never,
    tenderTrackingReader: opts.reader === false ? undefined : reader,
    tenderLogger: new TenderOperationLogger(l => logs.push(l), Date.now, opts.limit ?? 100),
  }));
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    await work(`http://127.0.0.1:${(server.address() as { port: number }).port}`, seen, logs);
  } finally {
    await new Promise<void>(r => server.close(() => r()));
  }
};
const call = (url: string, method: string, path: string, opts: { token?: string | null; body?: unknown; headers?: Record<string, string> } = {}) =>
  fetch(`${url}${path}`, {
    method,
    headers: {
      ...(opts.token === null ? {} : { authorization: `Bearer ${opts.token ?? token(42)}` }),
      ...(opts.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
const T = '/v1/businesses/3/tenders/tracking';
const sqlErr = (code: string) => Object.assign(new Error('x'), { code });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('every tender route requires a verified bearer token', async () => {
  await harness(() => rec(), async (url, seen) => {
    for (const [m, p, body] of [['POST', T, { title: 'T' }], ['GET', T], ['GET', `${T}/7`], ['PATCH', `${T}/7`, { title: 'x' }], ['POST', `${T}/7/archive`, {}], ['DELETE', `${T}/7`]] as const) {
      assert.equal((await call(url, m, p, { token: null, body })).status, 401, `${m} ${p}`);
    }
    assert.equal((await call(url, 'GET', T, { token: 'garbage' })).status, 401);
    assert.equal(seen.length, 0);
  });
});

test('the actor is the verified token account; body, query and headers cannot name an actor, account, business or role', async () => {
  await harness(() => rec(), async (url, seen) => {
    const r = await call(url, 'POST', T, { token: token(42), body: { title: 'T', actorAccountId: 1 } });
    assert.equal(r.status, 400); // unknown key rejected
    const ok = await call(url, 'GET', `${T}?limit=5`, { token: token(42), headers: { 'x-actor-account-id': '1', 'x-business-id': '99', 'x-role': 'owner' } });
    assert.equal(ok.status, 200);
    assert.equal(seen.at(-1)!.actor, 42);
    assert.equal(seen.at(-1)!.businessId, 3);
    assert.equal((await call(url, 'GET', `${T}?businessId=99`, {})).status, 400);
    assert.equal((await call(url, 'GET', `${T}?actor=1`, {})).status, 400);
  });
});

test('Business id comes from the path only and must be a positive integer', async () => {
  await harness(() => rec(), async (url, seen) => {
    for (const bad of ['0', '-1', '01', 'abc', '1.5', '1234567890123456']) {
      assert.equal((await call(url, 'GET', `/v1/businesses/${bad}/tenders/tracking`)).status, 400, bad);
    }
    assert.equal(seen.length, 0);
    await call(url, 'POST', '/v1/businesses/5/tenders/tracking', { body: { title: 'T', businessId: 3 } });
    assert.equal(seen.length, 0); // body business id is an unknown key
  });
});

test('strict body validation: unknown keys, wrong types, empty patch, archived stage and oversized bodies are 400', async () => {
  await harness(() => rec(), async (url, seen) => {
    for (const body of [{}, { title: 5 }, { title: 'T', stage: 'saved' }, { title: 'T', sourceUrl: 'http://x.example' }, { title: 'T', closingAt: 'soon' }, [{ title: 'T' }]]) {
      assert.equal((await call(url, 'POST', T, { body })).status, 400, JSON.stringify(body));
    }
    for (const body of [{}, { stage: 'archived' }, { stage: 'won' }, { title: null }, { businessId: 2 }]) {
      assert.equal((await call(url, 'PATCH', `${T}/7`, { body })).status, 400, JSON.stringify(body));
    }
    assert.equal((await call(url, 'POST', `${T}/7/archive`, { body: { force: true } })).status, 400);
    assert.equal((await call(url, 'POST', T, { body: { title: 'x'.repeat(20_000) } })).status, 413);
    assert.equal(seen.length, 0);
  });
});

test('list query is bounded and strict', async () => {
  await harness(() => ({ items: [], nextAfter: null }), async (url, seen) => {
    for (const q of ['limit=0', 'limit=51', 'limit=x', 'stage=won', 'after=0', 'after=abc', 'extra=1']) {
      assert.equal((await call(url, 'GET', `${T}?${q}`)).status, 400, q);
    }
    assert.equal(seen.length, 0);
    assert.equal((await call(url, 'GET', `${T}?limit=50&stage=archived&after=9`)).status, 200);
    assert.deepEqual(seen[0]!.args[0], { stage: 'archived', limit: 50, after: 9 });
  });
});

test('SQLSTATE mapping: 42501 403, 22023 400, P0001 409, 23505 409, P0002 404, other 503 without leaking detail', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['P0001', 409], ['23505', 409], ['P0002', 404], ['XX000', 503]] as const) {
    await harness(() => sqlErr(code), async (url) => {
      const r = await call(url, 'GET', `${T}/7`);
      assert.equal(r.status, status, code);
      const text = await r.text();
      assert.doesNotMatch(text, /XX000|42501|stack/);
    });
  }
});

test('non-member / wrong business is 403 for every operation, never 404 (no existence probing)', async () => {
  await harness(() => sqlErr('42501'), async (url) => {
    for (const [m, p, body] of [['POST', T, { title: 'T' }], ['GET', T], ['GET', `${T}/7`], ['PATCH', `${T}/7`, { title: 'x' }], ['POST', `${T}/7/archive`, {}], ['DELETE', `${T}/7`]] as const) {
      assert.equal((await call(url, m, p, { body })).status, 403, `${m} ${p}`);
    }
  });
});

test('a database result that breaks the contract is 503', async () => {
  await harness(() => new TenderGatewayContractError(), async (url) => {
    assert.equal((await call(url, 'GET', `${T}/7`)).status, 503);
  });
});

test('without a configured reader every tender route is 503 (no fallback)', async () => {
  await harness(() => rec(), async (url) => {
    assert.equal((await call(url, 'GET', T)).status, 503);
  }, { reader: false });
});

test('two ids: Gateway generates the authoritative id; client id is kept only if a UUID and never replaces it', async () => {
  await harness(() => rec(), async (url, seen) => {
    const client = '33333333-3333-4333-8333-333333333333';
    const r = await call(url, 'PATCH', `${T}/7`, { body: { title: 'N' }, headers: { 'x-request-id': client } });
    const gatewayId = r.headers.get('x-request-id')!;
    assert.match(gatewayId, UUID_RE);
    assert.notEqual(gatewayId, client);
    assert.deepEqual(seen[0]!.ids, { requestId: gatewayId, clientCorrelationId: client });

    await call(url, 'PATCH', `${T}/7`, { body: { title: 'N' }, headers: { 'x-request-id': 'not-a-uuid; DROP TABLE' } });
    assert.equal((seen[1]!.ids as { clientCorrelationId: unknown }).clientCorrelationId, null);
    assert.notEqual((seen[1]!.ids as { requestId: string }).requestId, (seen[0]!.ids as { requestId: string }).requestId);
  });
});

test('success logs carry both ids and allow-listed fields only; no tender text', async () => {
  await harness(() => rec({ title: 'SECRET TITLE', sourceUrl: 'https://secret.example/x' }), async (url, _seen, logs) => {
    const client = '44444444-4444-4444-8444-444444444444';
    await call(url, 'POST', T, { body: { title: 'SECRET TITLE', sourceUrl: 'https://secret.example/x' }, headers: { 'x-request-id': client } });
    assert.equal(logs.length, 1);
    const line = JSON.parse(logs[0]!);
    assert.deepEqual(Object.keys(line).sort(), ['actorAccountId', 'businessId', 'clientCorrelationId', 'event', 'operation', 'outcome', 'requestId', 'resourceId']);
    assert.equal(line.outcome, 'success');
    assert.equal(line.operation, 'tender.tracking.create');
    assert.equal(line.clientCorrelationId, client);
    assert.equal(line.actorAccountId, 42);
    assert.equal(line.resourceId, 7);
    assert.doesNotMatch(logs[0]!, /SECRET|secret\.example/);
  });
});

test('denials are logged (bounded metadata) and never stored; denial log has no resource id', async () => {
  await harness(() => sqlErr('42501'), async (url, _s, logs) => {
    await call(url, 'DELETE', `${T}/7`);
    const line = JSON.parse(logs[0]!);
    assert.equal(line.outcome, 'forbidden');
    assert.equal(line.resourceId, null);
    assert.equal(line.operation, 'tender.tracking.delete');
  });
});

test('log volume is capped per window with a single suppression summary', async () => {
  await harness(() => rec(), async (url, _s, logs) => {
    for (let i = 0; i < 6; i += 1) await call(url, 'GET', `${T}/7`);
    assert.equal(logs.filter(l => l.includes('"tender_operation"')).length, 2);
  }, { limit: 2 });
  const out: string[] = [];
  let t = 0;
  const logger = new TenderOperationLogger(l => out.push(l), () => t, 1, 1000);
  const f = { requestId: 'r', clientCorrelationId: null, actorAccountId: 1, businessId: 1, operation: 'o', resourceId: null, outcome: 'forbidden' as const };
  logger.log(f); logger.log(f); logger.log(f);
  t = 1000; logger.log(f);
  assert.equal(out.length, 3);
  assert.deepEqual(JSON.parse(out[1]!), { event: 'tender_operation_log_suppressed', suppressed: 2 });
});

test('mutation reaches the reader with the parsed values only (trimmed, normalised instant)', async () => {
  await harness(() => rec(), async (url, seen) => {
    await call(url, 'POST', T, { body: { title: '  Road  ', closingAt: '2026-12-01T12:00:00+02:00' } });
    assert.deepEqual(seen[0]!.args[0], { title: 'Road', referenceNumber: null, issuerName: null, sourceUrl: null, closingAt: '2026-12-01T10:00:00.000Z' });
  });
});

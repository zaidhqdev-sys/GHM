import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { ACCESS_JWT_AUD, ACCESS_JWT_ISS, createAccessJwtVerifier } from '../auth/foundation/access-jwt-verifier';
import { createActorGatewayApp } from './app';
import { TenderGatewayContractError } from './tender-tracking-reader';
import type { TenderAnalysisGatewayReader } from './tender-analysis-reader';
import { TenderOperationLogger } from './tender-request-context';
import { fixtureBody, metadataOf, recordFor, validInput } from '../tender/analysis-test-fixtures';

// Fake reader: proves routing, strict input, refusals before any database call, id handling,
// error mapping and logging. Authorization itself lives in SQL and has NOT run on PostgreSQL.
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const kid = 'tender-analysis-test';
const verifier = createAccessJwtVerifier(new Map([[kid, publicKey.export({ type: 'spki', format: 'pem' }).toString()]]));
const token = (account: number): string => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ sub: String(account), iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: now, exp: now + 900 },
    privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { algorithm: 'ES256', keyid: kid });
};
interface Seen { method: string; actor: number; businessId: number; args: unknown[] }
const harness = async (
  behaviour: (m: string, args: unknown[]) => unknown,
  work: (url: string, seen: Seen[], logs: string[]) => Promise<void>,
  opts: { reader?: boolean } = {},
): Promise<void> => {
  const seen: Seen[] = [];
  const logs: string[] = [];
  const wrap = (method: string) => async (actor: number, businessId: number, ...args: unknown[]) => {
    seen.push({ method, actor, businessId, args });
    const out = behaviour(method, args);
    if (out instanceof Error) throw out;
    return out;
  };
  const reader = { create: wrap('create'), list: wrap('list'), get: wrap('get'), remove: wrap('remove') } as unknown as TenderAnalysisGatewayReader;
  const server = http.createServer(createActorGatewayApp({
    verifier, actorIdentityReader: {} as never,
    tenderAnalysisReader: opts.reader === false ? undefined : reader,
    tenderLogger: new TenderOperationLogger(l => logs.push(l)),
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
const A = '/v1/businesses/3/tenders/analyses';
const input = validInput();
const rec = recordFor(input);
const ok = (m: string): unknown => (m === 'create' || m === 'get' ? rec : m === 'list' ? { items: [metadataOf(rec)], nextAfter: null } : { id: 11, businessId: 3, deleted: true });
const sqlErr = (code: string) => Object.assign(new Error('x'), { code });

test('every analysis route requires a verified bearer token', async () => {
  await harness(ok, async (url, seen) => {
    for (const [m, p, body] of [['POST', A, fixtureBody('valid complete, three chunks')], ['GET', A], ['GET', `${A}/11`], ['DELETE', `${A}/11`]] as const) {
      assert.equal((await call(url, m, p, { token: null, body })).status, 401, `${m} ${p}`);
    }
    assert.equal((await call(url, 'GET', A, { token: 'garbage' })).status, 401);
    assert.equal(seen.length, 0);
  });
});

test('the actor is the verified token account; body, query and headers cannot name actor, account, business or role', async () => {
  await harness(ok, async (url, seen) => {
    for (const extra of [{ accountId: 1 }, { businessId: 99 }, { role: 'owner' }, { createdBy: 1 }, { actorAccountId: 1 }]) {
      assert.equal((await call(url, 'POST', A, { body: { ...fixtureBody('valid complete, three chunks'), ...extra } })).status, 400);
    }
    assert.equal(seen.length, 0);
    const r = await call(url, 'POST', A, { token: token(42), body: fixtureBody('valid complete, three chunks'), headers: { 'x-actor-account-id': '1', 'x-business-id': '99', 'x-role': 'owner' } });
    assert.equal(r.status, 201);
    assert.equal(seen[0]!.actor, 42);
    assert.equal(seen[0]!.businessId, 3);
    assert.equal((await call(url, 'GET', `${A}?businessId=99`)).status, 400);
    assert.equal((await call(url, 'GET', `${A}?actor=1`)).status, 400);
  });
});

test('Business id comes from the path only; a body business id never reaches the reader', async () => {
  await harness(ok, async (url, seen) => {
    for (const bad of ['0', '-1', '01', 'abc', '1.5']) assert.equal((await call(url, 'GET', `/v1/businesses/${bad}/tenders/analyses`)).status, 400, bad);
    assert.equal(seen.length, 0);
    await call(url, 'POST', '/v1/businesses/5/tenders/analyses', { body: { ...fixtureBody('valid complete, three chunks'), businessId: 3 } });
    assert.equal(seen.length, 0);
  });
});

test('malformed, contradictory and evidence-broken bodies are refused with 400 BEFORE any database call', async () => {
  await harness(ok, async (url, seen) => {
    for (const name of [
      'coverage: complete but a part unprocessed', 'coverage: incomplete but every part processed', 'coverage: gap between parts',
      'coverage: unknown key in coverage', 'evidence: start inside an unread part', 'evidence: duplicate requirement ids',
      'evidence: right-to-left override in quote', 'truncation: flag false but items omitted', 'envelope: projection version 1',
      'envelope: source not ai_extracted', 'envelope: raw document text', 'envelope: hash uppercase', 'envelope: result missing',
    ]) {
      assert.equal((await call(url, 'POST', A, { body: fixtureBody(name) })).status, 400, name);
    }
    for (const body of [[], null, 'x', 5]) assert.equal((await call(url, 'POST', A, { body })).status, 400);
    assert.equal(seen.length, 0);
  });
});

test('unsupported analyses are refused with 422 and are never written', async () => {
  await harness(ok, async (url, seen, logs) => {
    for (const name of ['unsupported: coverage status unsupported', 'unsupported: minimal stored shape']) {
      const r = await call(url, 'POST', A, { body: fixtureBody(name) });
      assert.equal(r.status, 422, name);
      assert.deepEqual(await r.json(), { error: 'unsupported' });
    }
    assert.equal(seen.length, 0);
    assert.equal(JSON.parse(logs[0]!).outcome, 'invalid');
  });
});

test('oversized projections are refused with 413 before any database call', async () => {
  await harness(ok, async (url, seen) => {
    for (const name of ['oversized: result above 12 KiB, request within 16 KiB']) {
      assert.equal((await call(url, 'POST', A, { body: fixtureBody(name) })).status, 413, name);
    }
    assert.equal((await call(url, 'POST', A, { body: fixtureBody('oversized: request above 16 KiB') })).status, 413);
    assert.equal(seen.length, 0);
  });
});

test('valid complete, incomplete and truncated analyses reach the reader exactly as validated', async () => {
  await harness(ok, async (url, seen) => {
    for (const name of ['valid complete, three chunks', 'valid incomplete, middle part unavailable', 'valid truncated and incomplete', 'valid incomplete, tail budget and not attempted']) {
      const body = fixtureBody(name);
      const r = await call(url, 'POST', A, { body });
      assert.equal(r.status, 201, name);
      const sent = seen.at(-1)!.args[0] as { result: { coverage: unknown; truncatedForStorage: boolean } };
      assert.deepEqual(sent.result.coverage, (body.result as { coverage: unknown }).coverage, name);
      assert.equal(sent.result.truncatedForStorage, (body.result as { truncatedForStorage: boolean }).truncatedForStorage, name);
    }
  });
});

test('list query is bounded and strict; ids are positive integers', async () => {
  await harness(ok, async (url, seen) => {
    for (const q of ['limit=0', 'limit=51', 'limit=x', 'after=0', 'after=abc', 'stage=saved', 'extra=1']) assert.equal((await call(url, 'GET', `${A}?${q}`)).status, 400, q);
    for (const id of ['0', '01', '-1', 'abc']) {
      assert.equal((await call(url, 'GET', `${A}/${id}`)).status, 400, id);
      assert.equal((await call(url, 'DELETE', `${A}/${id}`)).status, 400, id);
    }
    assert.equal(seen.length, 0);
    assert.equal((await call(url, 'GET', `${A}?limit=50&after=9`)).status, 200);
    assert.deepEqual(seen[0]!.args[0], { limit: 50, after: 9 });
  });
});

test('SQLSTATE mapping: 42501 403, 22023 400, P0001 409, P0002 404, other 503 without leaking detail', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 400], ['P0001', 409], ['P0002', 404], ['XX000', 503]] as const) {
    await harness(() => sqlErr(code), async (url) => {
      const r = await call(url, 'GET', `${A}/11`);
      assert.equal(r.status, status, code);
      assert.doesNotMatch(await r.text(), /XX000|42501|stack/);
    });
  }
});

test('non-member / wrong business is 403 for every operation, never 404; a foreign tracking id is 404 only after authorization', async () => {
  await harness(() => sqlErr('42501'), async (url) => {
    for (const [m, p, body] of [['POST', A, fixtureBody('valid complete, three chunks')], ['GET', A], ['GET', `${A}/11`], ['DELETE', `${A}/11`]] as const) {
      assert.equal((await call(url, m, p, { body })).status, 403, `${m} ${p}`);
    }
  });
  await harness((m) => (m === 'create' ? sqlErr('P0002') : ok(m)), async (url) => {
    assert.equal((await call(url, 'POST', A, { body: fixtureBody('valid complete, with tracking id') })).status, 404);
  });
});

test('a reader contract fault (stored payload outside version 2) is 503, never returned', async () => {
  await harness(() => new TenderGatewayContractError(), async (url) => {
    assert.equal((await call(url, 'GET', `${A}/11`)).status, 503);
  });
});

test('without a configured reader every analysis route is 503 (no fallback)', async () => {
  await harness(ok, async (url) => {
    assert.equal((await call(url, 'GET', A)).status, 503);
  }, { reader: false });
});

test('two ids reach the reader for mutations; client id kept only if a UUID; success logs carry both and no tender text', async () => {
  await harness(ok, async (url, seen, logs) => {
    const client = '33333333-3333-4333-8333-333333333333';
    const r = await call(url, 'POST', A, { body: fixtureBody('valid complete, three chunks'), headers: { 'x-request-id': client } });
    const gatewayId = r.headers.get('x-request-id')!;
    assert.notEqual(gatewayId, client);
    assert.deepEqual(seen[0]!.args[1], { requestId: gatewayId, clientCorrelationId: client });
    const line = JSON.parse(logs[0]!);
    assert.deepEqual(Object.keys(line).sort(), ['actorAccountId', 'businessId', 'clientCorrelationId', 'event', 'operation', 'outcome', 'requestId', 'resourceId']);
    assert.equal(line.operation, 'tender.analysis.create');
    assert.equal(line.outcome, 'success');
    assert.equal(line.resourceId, 11);
    assert.doesNotMatch(logs.join('\n'), /Requirement|Closing date|summary of the tender/i);
    await call(url, 'DELETE', `${A}/11`, { headers: { 'x-request-id': 'not-a-uuid' } });
    assert.equal((seen[1]!.args[1] as { clientCorrelationId: unknown }).clientCorrelationId, null);
  });
});

test('denials are logged with bounded metadata only (never stored)', async () => {
  await harness(() => sqlErr('42501'), async (url, _s, logs) => {
    await call(url, 'DELETE', `${A}/11`);
    const line = JSON.parse(logs[0]!);
    assert.equal(line.outcome, 'forbidden');
    assert.equal(line.operation, 'tender.analysis.delete');
    assert.equal(line.resourceId, null);
  });
});

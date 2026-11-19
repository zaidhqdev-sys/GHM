import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import test from 'node:test';
import { TenderGatewayContractError } from './tender-tracking-reader';
import { PostgresTenderAnalysisGatewayReader } from './tender-analysis-reader';
import { fixtureBody, metadataOf, recordFor, validInput } from '../tender/analysis-test-fixtures';

// A FAKE pool modelling ONLY what the reader must supply to the SQL functions. It is a model of
// the contract, NOT the SQL: nothing here has run on PostgreSQL (blocker B5).
const secret = randomBytes(32);
const ids = { requestId: '11111111-1111-4111-8111-111111111111', clientCorrelationId: '22222222-2222-4222-8222-222222222222' };
interface Call { sql: string; params: unknown[] }
const makePool = (result: unknown, failWith?: { code: string }) => {
  const calls: Call[] = [];
  const nonces = new Set<string>();
  const state = { operation: '' };
  const verify = (params: unknown[], operation: string): void => {
    const [actor, issued, nonce, context, signature] = params as [number, number, string, string, string];
    const payload = `ghm-actor-gateway:v2|${actor}|${operation}|${issued}|${nonce}|${Buffer.from(context, 'utf8').toString('hex')}`;
    if (createHmac('sha256', secret).update(payload, 'utf8').digest('hex') !== signature) throw Object.assign(new Error('bad signature'), { code: '42501' });
    if (nonces.has(nonce)) throw Object.assign(new Error('replay'), { code: '42501' });
    nonces.add(nonce);
  };
  const client = {
    released: 0,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (failWith && /gateway_/.test(sql)) throw Object.assign(new Error('db'), failWith);
      if (/gateway_/.test(sql)) { verify(params, state.operation); return { rows: [{ result }] }; }
      return { rows: [] };
    },
    release() { this.released += 1; },
  };
  return { pool: { connect: async () => client } as never, calls, client, state, verify };
};
const reader = (pool: never) => new PostgresTenderAnalysisGatewayReader(pool, secret.toString('base64'));
const fnCall = (calls: Call[]) => calls.find(c => /gateway_/.test(c.sql))!;
const seq = (calls: Call[]) => calls.map(c => (/gateway_/.test(c.sql) ? 'CALL' : c.sql));

test('constructor requires a canonical 32-byte base64 secret', () => {
  assert.throws(() => new PostgresTenderAnalysisGatewayReader({ connect: async () => ({}) } as never, 'short'));
});

test('create: BEGIN, one signed call with the verified actor, the payload and both ids, then COMMIT', async () => {
  const input = validInput();
  const { pool, calls, state } = makePool(recordFor(input));
  state.operation = 'tender.analysis.create';
  const out = await reader(pool).create(42, 3, input, ids);
  assert.equal(out.id, 11);
  assert.deepEqual(seq(calls), ['BEGIN', 'CALL', 'COMMIT']);
  const p = fnCall(calls).params;
  assert.equal(p[0], 42);
  assert.deepEqual(JSON.parse(p[3] as string), {
    businessId: 3, trackingId: null, model: input.model, promptVersion: input.promptVersion, documentSha256: input.documentSha256,
    documentHashVersion: 1, result: input.result, requestId: ids.requestId, clientCorrelationId: ids.clientCorrelationId,
  });
  // Arguments equal the signed context (the SQL refuses any difference).
  assert.equal(p[5], 3);
  assert.deepEqual(JSON.parse(p[10] as string), input.result);
  assert.equal(p[11], ids.requestId);
  assert.equal(p[12], ids.clientCorrelationId);
});

test('modelled tamper: swapping the payload or business after signing no longer matches the signed context', async () => {
  const input = validInput();
  const { pool, calls, state } = makePool(recordFor(input));
  state.operation = 'tender.analysis.create';
  await reader(pool).create(42, 3, input, ids);
  const p = fnCall(calls).params;
  const context = JSON.parse(p[3] as string);
  assert.deepEqual(context.result, JSON.parse(p[10] as string));
  const other = structuredClone(input.result);
  other.coverage.status = other.coverage.status === 'complete' ? 'incomplete' : 'complete';
  assert.notDeepEqual(context.result, other);
  assert.notEqual(context.businessId, 4);
});

test('modelled replay: a captured assertion is refused the second time; each call has a fresh nonce; operation is bound', async () => {
  const input = validInput();
  const { pool, calls, state, verify } = makePool(recordFor(input));
  state.operation = 'tender.analysis.create';
  const r = reader(pool);
  await r.create(42, 3, input, ids);
  await r.create(42, 3, input, ids);
  const [a, b] = calls.filter(c => /gateway_/.test(c.sql));
  assert.notEqual(a!.params[2], b!.params[2]);
  assert.throws(() => verify(a!.params, 'tender.analysis.create'), (e: { code: string }) => e.code === '42501');
  const fresh = makePool(null);
  assert.throws(() => fresh.verify(a!.params, 'tender.analysis.delete'), (e: { code: string }) => e.code === '42501');
});

test('incomplete, truncated and tracking-linked analyses are stored as sent (status, coverage, evidence offsets, truncation)', async () => {
  for (const name of ['valid incomplete, middle part unavailable', 'valid truncated, items omitted for the budget', 'valid truncated and incomplete', 'valid complete, with tracking id']) {
    const input = validInput(name);
    const { pool, calls, state } = makePool(recordFor(input));
    state.operation = 'tender.analysis.create';
    const out = await reader(pool).create(42, 3, input, ids);
    assert.equal(out.coverageStatus, input.result.coverage.status, name);
    assert.deepEqual(out.result.coverage, input.result.coverage, name);
    assert.equal(out.result.truncatedForStorage, input.result.truncatedForStorage, name);
    assert.equal(fnCall(calls).params[6], input.trackingId, name);
  }
});

test('a database result that differs from what was sent rolls back BEFORE commit (never repaired, never returned)', async () => {
  const input = validInput('valid incomplete, middle part unavailable');
  const flipped = structuredClone(input.result);
  flipped.coverage.status = 'complete'; // a "fixed" status
  const bad: Record<string, unknown>[] = [
    recordFor(input, { result: flipped, coverageStatus: 'complete' }),
    recordFor(input, { coverageStatus: 'complete' }),
    // A perfectly valid payload that is simply not the one that was sent.
    recordFor(input, { result: { ...input.result, summary: 'A different but valid summary.' } }),
    recordFor(input, { result: { ...input.result, omitted: { ...input.result.omitted, requirements: 0 }, requirements: input.result.requirements.slice(1) } }),
    recordFor(input, { chunksProcessed: input.result.coverage.chunksTotal }),
    recordFor(input, { truncatedForStorage: !input.result.truncatedForStorage }),
    recordFor(input, { businessId: 99 }),
    recordFor(input, { createdBy: 7 }),
    recordFor(input, { model: 'other' }),
    recordFor(input, { documentSha256: 'c'.repeat(64) }),
    recordFor(input, { extra: true }),
    recordFor(input, { source: 'ghm_verified' }),
    { ...recordFor(input), result: { ...input.result, coverage: { ...input.result.coverage, status: 'unsupported' } } },
  ];
  for (const record of bad) {
    const { pool, calls, client, state } = makePool(record);
    state.operation = 'tender.analysis.create';
    await assert.rejects(reader(pool).create(42, 3, input, ids), TenderGatewayContractError);
    assert.ok(!calls.some(c => c.sql === 'COMMIT'));
    assert.equal(calls.at(-1)!.sql, 'ROLLBACK');
    assert.equal(client.released, 1);
  }
});

test('get validates the stored payload with the version-2 contract before returning it', async () => {
  const input = validInput();
  const good = recordFor(input);
  const { pool, state } = makePool(good);
  state.operation = 'tender.analysis.get';
  assert.equal((await reader(pool).get(42, 3, 11)).id, 11);

  const corrupt = (mutate: (r: Record<string, unknown>) => void): Record<string, unknown> => {
    const r = structuredClone(good) as Record<string, unknown>;
    mutate(r);
    return r;
  };
  const cases: Array<[string, Record<string, unknown>]> = [
    ['contradictory coverage in the stored payload', corrupt(r => { ((r.result as Record<string, Record<string, unknown>>).coverage as Record<string, unknown>).chunksProcessed = 1; })],
    ['evidence moved outside read text', corrupt(r => { Object.assign(((r.result as Record<string, unknown[]>).requirements[0]) as Record<string, unknown>, { start: 29_990, end: 30_020 }); })],
    ['version 1 payload', corrupt(r => { (r.result as Record<string, unknown>).projectionVersion = 1; })],
    ['unknown key in payload', corrupt(r => { (r.result as Record<string, unknown>).verified = true; })],
    ['truncation flag contradicting counts', corrupt(r => { (r.result as Record<string, unknown>).truncatedForStorage = true; })],
    ['record id differs from the request', corrupt(r => { r.id = 12; })],
    ['other business', corrupt(r => { r.businessId = 9; })],
    ['null', null as never],
  ];
  for (const [name, record] of cases) {
    const p = makePool(record);
    p.state.operation = 'tender.analysis.get';
    await assert.rejects(reader(p.pool).get(42, 3, 11), TenderGatewayContractError, name);
    assert.equal(p.calls.at(-1)!.sql, 'ROLLBACK', name);
  }
});

test('list returns metadata only, bounded, and rejects rows of another business or any payload leak', async () => {
  const input = validInput();
  const meta = metadataOf(recordFor(input));
  const { pool, calls, state } = makePool({ items: [meta], nextAfter: null });
  state.operation = 'tender.analysis.list';
  const out = await reader(pool).list(42, 3, { limit: 10, after: null });
  assert.equal(out.items.length, 1);
  assert.deepEqual(JSON.parse(fnCall(calls).params[3] as string), { businessId: 3, limit: 10, after: null });
  for (const bad of [
    { items: [{ ...meta, businessId: 9 }], nextAfter: null },
    { items: [recordFor(input)], nextAfter: null },
    { items: [{ ...meta, coverageStatus: 'unsupported' }], nextAfter: null },
    { items: Array.from({ length: 51 }, () => meta), nextAfter: null },
    { items: [], nextAfter: 'x' },
  ]) {
    const p = makePool(bad);
    p.state.operation = 'tender.analysis.list';
    await assert.rejects(reader(p.pool).list(42, 3, { limit: 10, after: null }), TenderGatewayContractError);
  }
});

test('delete signs the ids and operation, and returns only the deletion receipt', async () => {
  const { pool, calls, state } = makePool({ id: 11, businessId: 3, deleted: true });
  state.operation = 'tender.analysis.delete';
  const out = await reader(pool).remove(42, 3, 11, ids);
  assert.deepEqual(out, { id: 11, businessId: 3, deleted: true });
  const p = fnCall(calls).params;
  assert.deepEqual(p.slice(5), [3, 11, ids.requestId, ids.clientCorrelationId]);
  assert.deepEqual(JSON.parse(p[3] as string), { businessId: 3, analysisId: 11, requestId: ids.requestId, clientCorrelationId: ids.clientCorrelationId });
  const wrong = makePool({ id: 12, businessId: 3, deleted: true });
  wrong.state.operation = 'tender.analysis.delete';
  await assert.rejects(reader(wrong.pool).remove(42, 3, 11, ids), TenderGatewayContractError);
});

test('database errors roll back, release the connection and surface the SQLSTATE unchanged', async () => {
  const { pool, calls, client } = makePool(null, { code: '42501' });
  await assert.rejects(reader(pool).get(42, 3, 11), (e: { code: string }) => e.code === '42501');
  assert.equal(calls.at(-1)!.sql, 'ROLLBACK');
  assert.ok(!calls.some(c => c.sql === 'COMMIT'));
  assert.equal(client.released, 1);
});

test('the reader never accepts an unsupported payload it was handed', async () => {
  // Defence in depth: even if a caller bypassed the route, the contract has no unsupported shape.
  const body = fixtureBody('unsupported: coverage status unsupported');
  const { parseCreateAnalysis } = await import('../tender/analysis-contract');
  assert.deepEqual(parseCreateAnalysis(body), { ok: false, reason: 'unsupported' });
});

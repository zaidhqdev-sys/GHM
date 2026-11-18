import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import test from 'node:test';
import { PostgresTenderTrackingGatewayReader, TenderGatewayContractError } from './tender-tracking-reader';

// A FAKE pool. It records every statement and models ONLY what the reader must supply to
// the SQL functions (signature over the exact context, one-use nonce, context equals
// arguments). It is a model of the contract, NOT the SQL: nothing here has run on
// PostgreSQL (blocker B5).
const secret = randomBytes(32);
const ids = { requestId: '11111111-1111-4111-8111-111111111111', clientCorrelationId: '22222222-2222-4222-8222-222222222222' };
const record = (over: Record<string, unknown> = {}) => ({
  id: 7, businessId: 3, title: 'T', referenceNumber: null, issuerName: null, sourceUrl: null, sourceUrlVerified: false,
  closingAt: null, stage: 'saved', createdBy: 9, updatedBy: 9, createdAt: '2026-11-18T00:00:00Z', updatedAt: '2026-11-18T00:00:00Z',
  archivedAt: null, ...over,
});

interface Call { sql: string; params: unknown[] }
const makePool = (result: unknown, failWith?: { code: string }) => {
  const calls: Call[] = [];
  const nonces = new Set<string>();
  const verify = (params: unknown[], operation: string): void => {
    const [actor, issued, nonce, context, signature] = params as [number, number, string, string, string];
    const payload = `ghm-actor-gateway:v2|${actor}|${operation}|${issued}|${nonce}|${Buffer.from(context, 'utf8').toString('hex')}`;
    const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    if (expected !== signature) throw Object.assign(new Error('bad signature'), { code: '42501' });
    if (nonces.has(nonce)) throw Object.assign(new Error('replay'), { code: '42501' });
    nonces.add(nonce);
  };
  const client = {
    released: 0,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (failWith && /gateway_/.test(sql)) throw Object.assign(new Error('db'), failWith);
      if (/gateway_/.test(sql)) {
        const op = (client as { operation?: string }).operation ?? '';
        verify(params, op);
        return { rows: [{ result }] };
      }
      return { rows: [] };
    },
    release() { this.released += 1; },
  };
  return { pool: { connect: async () => client } as never, calls, client, verify };
};
const reader = (pool: never) => new PostgresTenderTrackingGatewayReader(pool, secret.toString('base64'));
const fnCall = (calls: Call[]) => calls.find(c => /gateway_/.test(c.sql))!;

test('constructor requires a canonical 32-byte base64 secret', () => {
  assert.throws(() => new PostgresTenderTrackingGatewayReader({ connect: async () => ({}) } as never, 'short'));
  assert.throws(() => new PostgresTenderTrackingGatewayReader({ connect: async () => ({}) } as never, Buffer.alloc(31).toString('base64')));
});

test('create runs BEGIN, one signed function call carrying the verified actor and both ids, then COMMIT', async () => {
  const { pool, calls, client } = makePool(record());
  (client as { operation?: string }).operation = 'tender.tracking.create';
  const out = await reader(pool).create(42, 3, { title: 'T', referenceNumber: null, issuerName: null, sourceUrl: null, closingAt: null }, ids);
  assert.equal(out.id, 7);
  assert.deepEqual(calls.map(c => c.sql.split('(')[0]), ['BEGIN', 'SELECT ghm.gateway_create_tender_tracking', 'COMMIT']);
  const p = fnCall(calls).params;
  assert.equal(p[0], 42);
  assert.deepEqual(JSON.parse(p[3] as string), {
    businessId: 3, title: 'T', referenceNumber: null, issuerName: null, sourceUrl: null, closingAt: null,
    requestId: ids.requestId, clientCorrelationId: ids.clientCorrelationId,
  });
  assert.equal(p[5], 3);
  assert.equal(p[11], ids.requestId);
  assert.equal(p[12], ids.clientCorrelationId);
  assert.equal(client.released, 1);
});

test('the signature binds the operation: a signature made for create does not verify as delete', async () => {
  const { pool, calls, client } = makePool(record());
  (client as { operation?: string }).operation = 'tender.tracking.create';
  await reader(pool).create(1, 3, { title: 'T', referenceNumber: null, issuerName: null, sourceUrl: null, closingAt: null }, ids);
  const { verify } = makePool(null);
  assert.throws(() => verify(fnCall(calls).params, 'tender.tracking.delete'), (e: { code: string }) => e.code === '42501');
});

test('modelled replay: re-submitting a captured assertion is refused; each call gets a fresh nonce', async () => {
  const { pool, calls, client, verify } = makePool(record());
  (client as { operation?: string }).operation = 'tender.tracking.get';
  const r = reader(pool);
  await r.get(1, 3, 7);
  await r.get(1, 3, 7);
  const [a, b] = calls.filter(c => /gateway_/.test(c.sql));
  assert.notEqual(a!.params[2], b!.params[2]);
  assert.throws(() => verify(a!.params, 'tender.tracking.get'), (e: { code: string }) => e.code === '42501');
});

test('modelled tamper: changing any argument after signing breaks the context binding the SQL enforces', async () => {
  const { pool, calls, client } = makePool(record());
  (client as { operation?: string }).operation = 'tender.tracking.update';
  await reader(pool).update(1, 3, 7, { title: 'New' }, ids);
  const p = fnCall(calls).params;
  const context = JSON.parse(p[3] as string);
  // The SQL compares p_context::jsonb with jsonb_build_object(arguments). Swapping the
  // business id argument (p[5]) or the patch argument (p[7]) makes them differ.
  assert.equal(context.businessId, p[5]);
  assert.deepEqual(context.patch, JSON.parse(p[7] as string));
  assert.notEqual(context.businessId, 4);
  assert.notDeepEqual(context.patch, { title: 'Other' });
});

test('update passes the patch with presence semantics (only supplied keys)', async () => {
  const { pool, calls, client } = makePool(record());
  (client as { operation?: string }).operation = 'tender.tracking.update';
  await reader(pool).update(1, 3, 7, { referenceNumber: null }, ids);
  assert.deepEqual(JSON.parse(fnCall(calls).params[7] as string), { referenceNumber: null });
});

test('list, get, archive and delete sign their own operation names and ids', async () => {
  for (const [op, run, pick] of [
    ['tender.tracking.list', (r: PostgresTenderTrackingGatewayReader) => r.list(1, 3, { stage: null, limit: 25, after: null }), { items: [record()], nextAfter: null }],
    ['tender.tracking.get', (r: PostgresTenderTrackingGatewayReader) => r.get(1, 3, 7), record()],
    ['tender.tracking.archive', (r: PostgresTenderTrackingGatewayReader) => r.archive(1, 3, 7, ids), record({ stage: 'archived', archivedAt: '2026-11-18T01:00:00Z' })],
    ['tender.tracking.delete', (r: PostgresTenderTrackingGatewayReader) => r.remove(1, 3, 7, ids), { id: 7, businessId: 3, deleted: true }],
  ] as const) {
    const { pool, calls, client } = makePool(pick);
    (client as { operation?: string }).operation = op;
    await run(reader(pool));
    assert.match(fnCall(calls).sql, new RegExp(`gateway_${op.split('.')[2]}_tender_tracking`));
    const p = fnCall(calls).params;
    const context = JSON.parse(p[3] as string);
    assert.equal(context.businessId, 3);
    if (op === 'tender.tracking.archive' || op === 'tender.tracking.delete') {
      // The signed context and the SQL arguments must carry the same ids.
      assert.equal(context.trackingId, 7);
      assert.equal(context.requestId, ids.requestId);
      assert.equal(context.clientCorrelationId, ids.clientCorrelationId);
      assert.deepEqual(p.slice(5), [3, 7, ids.requestId, ids.clientCorrelationId]);
    }
  }
});

test('database errors roll back, release the connection and surface the SQLSTATE unchanged', async () => {
  const { pool, calls, client } = makePool(null, { code: '42501' });
  await assert.rejects(reader(pool).get(1, 3, 7), (e: { code: string }) => e.code === '42501');
  assert.equal(calls.at(-1)!.sql, 'ROLLBACK');
  assert.ok(!calls.some(c => c.sql === 'COMMIT'));
  assert.equal(client.released, 1);
});

test('a database result that violates the contract is a server fault, never returned', async () => {
  for (const bad of [record({ extra: 1 }), record({ stage: 'won' }), record({ sourceUrlVerified: true }), record({ stage: 'archived', archivedAt: null }), null, 'x']) {
    const { pool, client } = makePool(bad);
    (client as { operation?: string }).operation = 'tender.tracking.get';
    await assert.rejects(reader(pool).get(1, 3, 7), TenderGatewayContractError);
  }
});

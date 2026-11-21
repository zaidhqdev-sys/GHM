import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import type { Pool, PoolClient } from 'pg';
import { PostgresGatewayCapabilityMutationReader } from './business-capability-mutation-reader';

const secret = Buffer.alloc(32, 7).toString('base64');
const row = {
  id: 101, business_id: '55', capability_id: '550e8400-e29b-41d4-a716-446655440000',
  proficiency_level: 'advanced', description: 'Electrical installation',
  assertion_status: 'active', assertion_basis: 'self_declared', verification_status: 'unverified',
  effective_from: new Date('2026-09-01T00:00:00.000Z'), effective_until: null,
  source_reference: 'reference-1', submitted_at: new Date('2026-09-01T00:00:00.000Z'),
  verified_by: null, verified_at: null, verification_reason: null, created_by: '42',
  created_at: new Date('2026-09-01T00:00:00.000Z'), updated_at: new Date('2026-09-01T00:00:00.000Z'),
};

test('Gateway reader signs exact create context and calls the signed SQL wrapper', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  let released = false;
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT * FROM ghm.gateway_create_business_capability')) return { rowCount: 1, rows: [row] };
      return { rowCount: null, rows: [] };
    },
    release: () => { released = true; },
  } as unknown as PoolClient;
  const pool = { connect: async () => client } as unknown as Pool;
  const reader = new PostgresGatewayCapabilityMutationReader(pool, secret);
  const effectiveFrom = new Date('2026-09-01T00:00:00.000Z');
  const result = await reader.create(42, {
    businessId: 55,
    capabilityId: row.capability_id,
    proficiencyLevel: 'advanced',
    description: 'Electrical installation',
    effectiveFrom,
    sourceReference: 'reference-1',
  });

  assert.equal(result.id, 101);
  assert.equal(result.businessId, 55);
  assert.equal(result.createdBy, 42);
  assert.equal(result.assertionStatus, 'active');
  assert.deepEqual(calls.map(call => call.sql), [
    'BEGIN',
    'SELECT * FROM ghm.gateway_create_business_capability($1,$2,$3,$4,$5,$6::jsonb)',
    'COMMIT',
  ]);
  assert.equal(released, true);

  const values = calls[1].values!;
  assert.equal(values[0], 42);
  const context = String(values[3]);
  const payload = JSON.parse(context);
  assert.deepEqual(payload, {
    businessId: 55,
    capabilityId: row.capability_id,
    proficiencyLevel: 'advanced',
    description: 'Electrical installation',
    effectiveFrom: effectiveFrom.toISOString(),
    effectiveUntil: null,
    sourceReference: 'reference-1',
  });
  assert.equal(values[5], context);
  const signedPayload = `ghm-actor-gateway:v2|42|business.capability.create|${values[1]}|${values[2]}|${Buffer.from(context, 'utf8').toString('hex')}`;
  const expected = createHmac('sha256', Buffer.from(secret, 'base64')).update(signedPayload, 'utf8').digest('hex');
  assert.equal(values[4], expected);
});

test('Gateway reader rejects a non-canonical or incorrectly sized assertion key', () => {
  const pool = { connect: async () => { throw new Error('must not connect'); } } as unknown as Pool;
  assert.throws(() => new PostgresGatewayCapabilityMutationReader(pool, 'not-a-key'), /canonical base64 for exactly 32 bytes/);
});

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { PostgresTrustScoreGatewayReader } from './trust-score-reader';

test('Trust Score gateway reader signs actor, operation and exact Business target', async () => {
  const secret = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const row = {
    id: '3', business_id: '42', profile_complete: 0, phone_verified: 0, email_verified: 0,
    id_verified: 0, cipc_verified: 0, vat_verified: 0, insurance_verified: 0,
    reviews_score: 14, completed_projects: 0, total_score: 14, trust_level: 'bronze',
    last_updated: new Date('2026-11-11T10:00:00.000Z'),
    created_at: new Date('2026-11-11T10:00:00.000Z'),
    updated_at: new Date('2026-11-11T10:00:00.000Z'),
  };
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT * FROM ghm.gateway_calculate_business_trust_score')) return { rows: [row], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const reader = new PostgresTrustScoreGatewayReader({ connect: async () => client } as never, secret);
  const result = await reader.calculate(7, 42);
  assert.equal(result.businessId, 42);
  assert.equal(result.totalScore, 14);
  assert.deepEqual(calls.map(call => call.sql === 'BEGIN' || call.sql === 'COMMIT' ? call.sql : 'gateway'), ['BEGIN', 'gateway', 'COMMIT']);
  const values = calls[1].values as [number, number, string, string, string, number];
  const payload = `ghm-actor-gateway:v2|${values[0]}|trust.score.calculate|${values[1]}|${values[2]}|${Buffer.from(values[3], 'utf8').toString('hex')}`;
  assert.equal(values[4], createHmac('sha256', Buffer.from(secret, 'base64')).update(payload, 'utf8').digest('hex'));
  assert.deepEqual(JSON.parse(values[3]), { businessId: 42 });
});

test('Trust Score gateway reader rolls back on rejected database assertion', async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith('SELECT * FROM ghm.gateway_calculate_business_trust_score')) throw Object.assign(new Error('denied'), { code: '42501' });
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const reader = new PostgresTrustScoreGatewayReader({ connect: async () => client } as never,
    Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'));
  await assert.rejects(() => reader.calculate(7, 42), /denied/);
  assert.deepEqual(calls, ['BEGIN', calls[1], 'ROLLBACK']);
});

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { PostgresBusinessLogoGatewayReader } from './business-logo-reader';

test('Business Logo gateway reader signs actor, operation, Business and nullable object ID', async () => {
  const secret = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT ghm.gateway_set_business_logo_object')) return { rows: [{ previous_object_id: '88' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const reader = new PostgresBusinessLogoGatewayReader({ connect: async () => client } as never, secret);
  const previous = await reader.bind(7, 42, null);
  assert.equal(previous, 88);
  assert.deepEqual(calls.map(call => call.sql === 'BEGIN' || call.sql === 'COMMIT' ? call.sql : 'gateway'), ['BEGIN', 'gateway', 'COMMIT']);
  const values = calls[1].values as [number, number, string, string, string, number, null];
  const payload = `ghm-actor-gateway:v2|${values[0]}|business.logo.bind|${values[1]}|${values[2]}|${Buffer.from(values[3], 'utf8').toString('hex')}`;
  assert.equal(values[4], createHmac('sha256', Buffer.from(secret, 'base64')).update(payload, 'utf8').digest('hex'));
  assert.deepEqual(JSON.parse(values[3]), { businessId: 42, objectId: null });
  assert.equal(values[5], 42);
  assert.equal(values[6], null);
});

test('Business Logo gateway reader rolls back when database assertion is rejected', async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith('SELECT ghm.gateway_set_business_logo_object')) throw Object.assign(new Error('denied'), { code: '42501' });
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const reader = new PostgresBusinessLogoGatewayReader({ connect: async () => client } as never,
    Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'));
  await assert.rejects(() => reader.bind(7, 42, 88), /denied/);
  assert.deepEqual(calls, ['BEGIN', calls[1], 'ROLLBACK']);
});

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { PostgresBusinessHoursGatewayReader } from './business-hours-reader';

test('Business Hours gateway reader signs actor, operation, business and complete schedule', async () => {
  const secret = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const row = {
    id: '9',
    business_id: '42',
    day_of_week: 1,
    is_closed: false,
    open_time: '08:00:00',
    close_time: '17:00:00',
    created_by: '7',
    created_at: new Date('2026-11-11T10:00:00.000Z'),
    updated_at: new Date('2026-11-11T10:00:00.000Z'),
  };
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT * FROM ghm.gateway_replace_business_hours')) {
        return { rows: [row], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const pool = { connect: async () => client };
  const reader = new PostgresBusinessHoursGatewayReader(pool as never, secret);
  const hours = [{ day_of_week: 1, is_closed: false, open_time: '08:00', close_time: '17:00' }];
  const result = await reader.replace(7, 42, hours);

  assert.equal(result.length, 1);
  assert.equal(result[0].businessId, 42);
  assert.equal(result[0].createdBy, 7);
  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(calls[1].sql, /gateway_replace_business_hours/);
  assert.equal(calls[2].sql, 'COMMIT');

  const values = calls[1].values as [number, number, string, string, string, number, string];
  assert.equal(values[0], 7);
  assert.equal(values[5], 42);
  assert.equal(values[6], JSON.stringify(hours));
  const payload = `ghm-actor-gateway:v2|${values[0]}|business.hours.replace|${values[1]}|${values[2]}|${Buffer.from(values[3], 'utf8').toString('hex')}`;
  const expected = createHmac('sha256', Buffer.from(secret, 'base64')).update(payload, 'utf8').digest('hex');
  assert.equal(values[4], expected);
  assert.deepEqual(JSON.parse(values[3]), { businessId: 42, hours });
});

test('Business Hours gateway reader rolls back when the database rejects the assertion', async () => {
  const calls: string[] = [];
  const client = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith('SELECT * FROM ghm.gateway_replace_business_hours')) {
        throw Object.assign(new Error('denied'), { code: '42501' });
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const reader = new PostgresBusinessHoursGatewayReader({ connect: async () => client } as never,
    Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'));
  await assert.rejects(() => reader.replace(7, 42, []), /denied/);
  assert.deepEqual(calls, ['BEGIN', calls[1], 'ROLLBACK']);
  assert.match(calls[1], /gateway_replace_business_hours/);
});

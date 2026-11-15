import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import type { PoolClient } from 'pg';
import { PostgresBusinessProfileReader } from './business-profile-reader';

const key = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
const secret = key.toString('base64');

test('Business profile reader signs the exact actor, operation, target and patch and commits', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  let released = false;
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT updated.id')) {
        return { rowCount: 1, rows: [{ id: '73' }] };
      }
      return { rowCount: null, rows: [] };
    },
    release() { released = true; },
  } as unknown as PoolClient;
  const reader = new PostgresBusinessProfileReader({ connect: async () => client } as never, secret);
  const patch = { name: 'Updated Business', physicalAddress: 'Durban' };

  const result = await reader.updateBusinessProfile(42, 73, patch);

  assert.deepEqual(result, { businessId: 73 });
  assert.deepEqual(calls.map((call) => call.sql), [
    'BEGIN',
    'SELECT updated.id FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb) AS updated',
    'COMMIT',
  ]);
  const values = calls[1].values!;
  assert.equal(values[0], 42);
  assert.equal(values[5], 73);
  const context = String(values[3]);
  assert.deepEqual(JSON.parse(context), { businessId: 73, patch });
  const payload = `ghm-actor-gateway:v2|42|business.profile.update|${values[1]}|${values[2]}|${Buffer.from(context, 'utf8').toString('hex')}`;
  const expected = createHmac('sha256', key).update(payload, 'utf8').digest('hex');
  assert.equal(values[4], expected);
  assert.deepEqual(JSON.parse(String(values[6])), patch);
  assert.equal(released, true);
});

test('Business profile reader rolls back and releases the connection when the database denies the write', async () => {
  const statements: string[] = [];
  let released = false;
  const client = {
    async query(sql: string) {
      statements.push(sql);
      if (sql.startsWith('SELECT updated.id')) {
        throw Object.assign(new Error('Business management permission required'), { code: '42501' });
      }
      return { rowCount: null, rows: [] };
    },
    release() { released = true; },
  } as unknown as PoolClient;
  const reader = new PostgresBusinessProfileReader({ connect: async () => client } as never, secret);

  await assert.rejects(
    () => reader.updateBusinessProfile(42, 73, { description: 'Denied' }),
    (error: unknown) => error instanceof Error && (error as NodeJS.ErrnoException).code === '42501',
  );
  assert.deepEqual(statements, [
    'BEGIN',
    'SELECT updated.id FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb) AS updated',
    'ROLLBACK',
  ]);
  assert.equal(released, true);
});

test('Business profile reader rejects non-canonical or non-32-byte assertion secrets', () => {
  assert.throws(
    () => new PostgresBusinessProfileReader({ connect: async () => { throw new Error('unused'); } } as never, Buffer.alloc(31).toString('base64')),
    /exactly 32 bytes/,
  );
  assert.throws(
    () => new PostgresBusinessProfileReader({ connect: async () => { throw new Error('unused'); } } as never, `${secret}=`),
    /canonical base64/,
  );
});

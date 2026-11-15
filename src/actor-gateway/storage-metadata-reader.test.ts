import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { PostgresStorageMetadataGatewayReader } from './storage-metadata-reader';

const secret = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const row = {
  id: '8', tenant_business_id: '42', resource_type: 'business', resource_id: '42',
  object_class: 'business_logo', provider_key: 'media/logos/42/object',
  content_type: 'image/png', byte_size: '100', visibility: 'public', status: 'pending',
};

function makeReader(resultRows = [row]) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT * FROM ghm.gateway_storage_')) return { rows: resultRows, rowCount: resultRows.length };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const reader = new PostgresStorageMetadataGatewayReader({ connect: async () => client } as never, secret);
  return { reader, calls };
}

test('storage create signs exact metadata and passes only the verified actor as identity', async () => {
  const { reader, calls } = makeReader();
  const input = {
    businessId: 42, resourceType: 'business' as const, resourceId: 42,
    objectClass: 'business_logo' as const, providerKey: 'media/logos/42/object',
    contentType: 'image/png' as const, byteSize: 100, visibility: 'public' as const,
    originalFilename: null,
  };
  const result = await reader.createPending(7, input);
  assert.equal(result.id, '8');
  const values = calls[1].values as [number, number, string, string, string, number, string, number, string, string, string, number, string, null];
  const payload = `ghm-actor-gateway:v2|${values[0]}|storage.metadata.create|${values[1]}|${values[2]}|${Buffer.from(values[3], 'utf8').toString('hex')}`;
  assert.equal(values[4], createHmac('sha256', Buffer.from(secret, 'base64')).update(payload, 'utf8').digest('hex'));
  assert.deepEqual(JSON.parse(values[3]), input);
  assert.deepEqual(values.slice(5), [42, 'business', 42, 'business_logo', 'media/logos/42/object', 'image/png', 100, 'public', null]);
  assert.deepEqual(calls.map(c => c.sql), ['BEGIN', calls[1].sql, 'COMMIT']);
});

test('storage read signs object ID and returns null for an inaccessible object', async () => {
  const { reader, calls } = makeReader([]);
  assert.equal(await reader.getObject(7, 99), null);
  assert.deepEqual(JSON.parse(calls[1].values![3] as string), { objectId: 99 });
  assert.match(calls[1].sql, /gateway_storage_get_object/);
  assert.deepEqual(calls.map(c => c.sql), ['BEGIN', calls[1].sql, 'COMMIT']);
});

test('deletion request signs object ID and invokes only the actor-authorized transition', async () => {
  const { reader, calls } = makeReader([{ ...row, status: 'deletion_pending' }]);
  const result = await reader.markDeletionPending(7, 8);
  assert.equal(result.status, 'deletion_pending');
  assert.deepEqual(JSON.parse(calls[1].values![3] as string), { objectId: 8 });
  assert.match(calls[1].sql, /gateway_storage_mark_deletion_pending/);
});

test('reader rejects non-canonical or incorrectly sized assertion secrets', () => {
  assert.throws(() => new PostgresStorageMetadataGatewayReader({ connect: async () => { throw new Error('unused'); } } as never, 'bad'));
});

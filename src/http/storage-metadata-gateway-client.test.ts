import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { HttpStorageMetadataGatewayClient, StorageMetadataGatewayError } from './storage-metadata-gateway-client';

const secret = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const row = {
  id: '9', tenant_business_id: '7', resource_type: 'business', resource_id: '7',
  object_class: 'business_logo', provider_key: 'media/logos/7/object',
  content_type: 'image/png', byte_size: 1024, visibility: 'public',
  status: 'available', checksum: 'sha256:abc',
};

test('storage metadata gateway forwards caller token and returns typed metadata', async () => {
  let request: Request | undefined;
  const client = new HttpStorageMetadataGatewayClient(
    'https://actor.example', 'caller-token', secret, 5000,
    (async (input: string, init?: RequestInit) => {
      request = new Request(String(input), init);
      return Response.json({ object: row });
    }) as typeof fetch,
  );
  const result = await client.getById('9');
  assert.equal(result?.id, '9');
  assert.equal(result?.businessId, '7');
  assert.equal(request?.headers.get('authorization'), 'Bearer caller-token');
  assert.equal(request?.redirect, 'error');
  assert.equal(new URL(request!.url).pathname, '/v1/storage/metadata/9');
});

test('storage metadata gateway signs provider transition context and forwards evidence', async () => {
  let request: Request | undefined;
  const client = new HttpStorageMetadataGatewayClient(
    'https://actor.example', 'caller-token', secret, 5000,
    (async (input: string, init?: RequestInit) => {
      request = new Request(String(input), init);
      return Response.json({ object: row });
    }) as typeof fetch,
  );
  await client.markAvailable('9', 'sha256:abc', {
    id: '9', businessId: '7', resourceType: 'business', resourceId: '7',
    objectClass: 'business_logo', providerKey: row.provider_key, contentType: 'image/png',
    byteSize: 1024, visibility: 'public', status: 'pending',
  });
  const body = await request!.json() as {
    checksum: string; providerKey: string; attestation: { issuedAt: number; nonce: string; context: string; signature: string };
  };
  assert.equal(body.providerKey, row.provider_key);
  assert.equal(body.checksum, 'sha256:abc');
  const payload = `ghm-storage-provider:v1|storage.provider.mark_available|${body.attestation.issuedAt}|${body.attestation.nonce}|${Buffer.from(body.attestation.context, 'utf8').toString('hex')}`;
  const expected = createHmac('sha256', Buffer.from(secret, 'base64')).update(payload, 'utf8').digest('hex');
  assert.equal(body.attestation.signature, expected);
  assert.deepEqual(JSON.parse(body.attestation.context), {
    businessId: 7, objectId: 9, providerKey: row.provider_key,
    contentType: 'image/png', byteSize: 1024, checksum: 'sha256:abc',
  });
});

test('storage metadata gateway maps authorization and not-found responses without leaking bodies', async () => {
  const client = new HttpStorageMetadataGatewayClient(
    'https://actor.example', 'caller-token', secret, 5000,
    (async () => new Response('sensitive upstream body', { status: 403 })) as typeof fetch,
  );
  await assert.rejects(() => client.getById('9'), (error: unknown) =>
    error instanceof StorageMetadataGatewayError && error.status === 403 && !error.message.includes('sensitive'));
});

test('storage metadata gateway rejects invalid signer keys and non-HTTPS origins', () => {
  assert.throws(() => new HttpStorageMetadataGatewayClient('https://actor.example', 'token', 'bad'));
  assert.throws(() => new HttpStorageMetadataGatewayClient('http://actor.example', 'token', secret));
});

test('storage metadata gateway transports pending creation, deletion request and provider-confirmed deletion', async () => {
  const requests: Request[] = [];
  const client = new HttpStorageMetadataGatewayClient(
    'https://actor.example', 'caller-token', secret, 5000,
    (async (input: string, init?: RequestInit) => {
      const request = new Request(String(input), init);
      requests.push(request);
      return Response.json({ object: row });
    }) as typeof fetch,
  );
  const evidence = {
    id: '9', businessId: '7', resourceType: 'business', resourceId: '7',
    objectClass: 'business_logo' as const, providerKey: row.provider_key, contentType: 'image/png',
    byteSize: 1024, visibility: 'public' as const, status: 'deletion_pending' as const,
  };
  await client.createPending({
    businessId: '7', resourceType: 'business', resourceId: '7',
    objectClass: 'business_logo', providerKey: row.provider_key, contentType: 'image/png',
    byteSize: 1024, visibility: 'public',
  });
  await client.markDeletionPending('9');
  await client.markDeleted('9', evidence);

  assert.deepEqual(requests.map(request => [request.method, new URL(request.url).pathname]), [
    ['POST', '/v1/storage/metadata'],
    ['POST', '/v1/storage/metadata/9/deletion-pending'],
    ['POST', '/v1/storage/metadata/9/deleted'],
  ]);
  const createBody = await requests[0].clone().json() as Record<string, unknown>;
  assert.deepEqual(createBody, {
    businessId: 7, resourceId: 7, providerKey: row.provider_key,
    contentType: 'image/png', byteSize: 1024, originalFilename: null,
  });
  const deleteBody = await requests[2].clone().json() as {
    providerKey: string; attestation: { issuedAt: number; nonce: string; context: string; signature: string };
  };
  assert.equal(deleteBody.providerKey, row.provider_key);
  const payload = `ghm-storage-provider:v1|storage.provider.mark_deleted|${deleteBody.attestation.issuedAt}|${deleteBody.attestation.nonce}|${Buffer.from(deleteBody.attestation.context, 'utf8').toString('hex')}`;
  const expected = createHmac('sha256', Buffer.from(secret, 'base64')).update(payload, 'utf8').digest('hex');
  assert.equal(deleteBody.attestation.signature, expected);
  assert.deepEqual(JSON.parse(deleteBody.attestation.context), {
    businessId: 7, objectId: 9, providerKey: row.provider_key,
  });
});


import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createStorageProviderWorkflowAttestation } from './storage-provider-attestation';

const secret = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');

test('provider workflow attestation signs the domain, operation and exact context', () => {
  const context = { businessId: 7, objectId: 9, providerKey: 'media/logos/7/object' };
  const proof = createStorageProviderWorkflowAttestation(secret, 'storage.provider.mark_deleted', context);
  const payload = `ghm-storage-provider:v1|storage.provider.mark_deleted|${proof.issuedAt}|${proof.nonce}|${Buffer.from(proof.context, 'utf8').toString('hex')}`;
  assert.equal(proof.signature, createHmac('sha256', Buffer.from(secret, 'base64')).update(payload, 'utf8').digest('hex'));
  assert.deepEqual(JSON.parse(proof.context), context);
});

test('provider workflow attestation rejects non-canonical or incorrectly sized keys', () => {
  assert.throws(() => createStorageProviderWorkflowAttestation('bad', 'storage.provider.mark_available', {}), /canonical base64/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProductConsumerRequest, ProductConsumerRequestError } from './product-consumer-contract';

test('product consumer contract parses the canonical request envelope', () => {
  const request = parseProductConsumerRequest({
    operation: { resource: 'saved_business', operation: 'read' },
    externalIdentity: { provider: 'supabase', subject: 'external-123' },
    input: { savedBusinessId: 7 },
  });
  assert.deepEqual(request, {
    operation: { resource: 'saved_business', operation: 'read' },
    externalIdentity: { provider: 'supabase', subject: 'external-123' },
    input: { savedBusinessId: 7 },
  });
});

test('product consumer contract preserves omitted input as undefined', () => {
  const request = parseProductConsumerRequest({
    operation: { resource: 'saved_business', operation: 'read' },
    externalIdentity: { provider: 'supabase', subject: 'external-123' },
  });
  assert.equal(request.input, undefined);
});

test('product consumer contract rejects malformed envelopes', () => {
  assert.throws(() => parseProductConsumerRequest(null), ProductConsumerRequestError);
  assert.throws(() => parseProductConsumerRequest({ operation: { resource: 'saved_business' }, externalIdentity: { provider: 'supabase', subject: 'x' } }), ProductConsumerRequestError);
  assert.throws(() => parseProductConsumerRequest({ operation: { resource: 'saved_business', operation: 'read' }, externalIdentity: { provider: '', subject: 'x' } }), ProductConsumerRequestError);
});

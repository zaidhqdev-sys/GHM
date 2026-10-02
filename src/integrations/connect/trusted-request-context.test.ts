import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConnectIntegrationLifecycleRepository } from './integration-lifecycle';
import { ConnectTrustedRequestContextError, establishConnectTrustedRequestContext } from './trusted-request-context';
import type { VerifiedConnectServiceAssertion } from './service-assertion';

const assertion = (overrides: Partial<VerifiedConnectServiceAssertion> = {}): VerifiedConnectServiceAssertion => ({
  integrationId: 'connect-prod',
  requestId: 'request-001',
  claims: { sub: 'connect-prod', iss: 'ghm-service-auth', aud: 'ghm-connect-service', iat: 1000, exp: 1300, jti: 'request-001' },
  ...overrides,
});

const active: ConnectIntegrationLifecycleRepository = {
  async get(id) {
    assert.equal(id, 'connect-prod');
    return { id, displayName: 'Connect Production', status: 'active', createdAt: new Date(), updatedAt: new Date(), disabledAt: null, revokedAt: null };
  },
};

test('establishes trusted Connect integration principal from verified assertion and active lifecycle', async () => {
  const context = await establishConnectTrustedRequestContext(assertion(), {
    operation: { resource: 'saved_business', operation: 'read' },
    externalIdentity: { provider: 'supabase', subject: '550e8400-e29b-41d4-a716-446655440000' },
    input: { page: 1 },
  }, active);
  assert.equal(context.principal.type, 'connect_integration');
  assert.equal(context.principal.integrationId, 'connect-prod');
  assert.equal(context.request.requestId, 'request-001');
  assert.deepEqual(context.request.operation, { resource: 'saved_business', operation: 'read' });
  assert.equal(context.request.externalIdentity?.subject, '550e8400-e29b-41d4-a716-446655440000');
});

test('fails closed when assertion identity and request id are inconsistent', async () => {
  await assert.rejects(() => establishConnectTrustedRequestContext(assertion({ integrationId: 'other' }), { operation: { resource: 'saved_business', operation: 'read' } }, active), ConnectTrustedRequestContextError);
});

test('fails closed when integration is not active', async () => {
  const lifecycle: ConnectIntegrationLifecycleRepository = {
    async get() { return { id: 'connect-prod', displayName: 'Connect Production', status: 'disabled', createdAt: new Date(), updatedAt: new Date(), disabledAt: new Date(), revokedAt: null }; },
  };
  await assert.rejects(() => establishConnectTrustedRequestContext(assertion(), { operation: { resource: 'saved_business', operation: 'read' } }, lifecycle), /not active/);
});

test('rejects unregistered operations', async () => {
  await assert.rejects(() => establishConnectTrustedRequestContext(assertion(), { operation: { resource: 'saved_business', operation: 'not-a-real-operation' as never } }, active), ConnectTrustedRequestContextError);
});

test('rejects malformed external identity', async () => {
  await assert.rejects(() => establishConnectTrustedRequestContext(assertion(), {
    operation: { resource: 'saved_business', operation: 'read' },
    externalIdentity: { provider: 'supabase', subject: 'not-a-uuid' },
  }, active), ConnectTrustedRequestContextError);
});

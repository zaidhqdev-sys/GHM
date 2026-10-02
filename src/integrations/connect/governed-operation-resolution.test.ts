import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConnectTrustedRequestContext } from './trusted-request-context';
import { resolveConnectGovernedOperation } from './governed-operation-resolution';

const context = (resource: 'saved_business' | 'business', operation: 'read' | 'create'): ConnectTrustedRequestContext =>
  ({
    principal: {
      type: 'connect_integration',
      integrationId: 'connect-prod',
      displayName: 'Connect',
      status: 'active',
    },
    request: {
      integration: {
        type: 'connect_integration',
        integrationId: 'connect-prod',
        displayName: 'Connect',
        status: 'active',
      },
      requestId: 'request-1',
      operation: { resource, operation },
      externalIdentity: null,
      input: {},
    },
    assertion: {
      sub: 'connect-prod',
      iss: 'ghm-service-auth',
      aud: 'ghm-connect-service',
      iat: 100,
      exp: 200,
      jti: 'request-1',
    },
  }) as ConnectTrustedRequestContext;

test('resolves a registered operation to its canonical capability name', () => {
  const resolved = resolveConnectGovernedOperation(context('saved_business', 'read'));

  assert.deepEqual(resolved, {
    resource: 'saved_business',
    operation: 'read',
    capability: 'saved_business.read',
  });
  assert.equal(Object.isFrozen(resolved), true);
});

test('does not turn the integration principal into end-user authorization', () => {
  const resolved = resolveConnectGovernedOperation(context('business', 'create'));

  assert.equal(resolved.capability, 'business.create');
  assert.equal('userId' in resolved, false);
  assert.equal('role' in resolved, false);
  assert.equal('accountId' in resolved, false);
});

test('fails closed when the trusted request context is missing', () => {
  assert.throws(
    () => resolveConnectGovernedOperation(null as unknown as ConnectTrustedRequestContext),
    /Trusted Connect request context is required/,
  );
});

test('re-checks registry membership before resolution', () => {
  const invalid = context('saved_business', 'read') as ConnectTrustedRequestContext;
  Object.defineProperty(invalid.request, 'operation', {
    value: { resource: 'saved_business', operation: 'update' },
  });

  assert.throws(
    () => resolveConnectGovernedOperation(invalid),
    /Requested operation is not registered/,
  );
});

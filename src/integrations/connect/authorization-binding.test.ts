import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountAuthStateStore } from '../../auth/ghm-bearer';
import type { ConnectIdentityAdapter } from './identity-adapter';
import type { ConnectGovernedOperation } from './governed-operation-resolution';
import type { ConnectTrustedRequestContext } from './trusted-request-context';
import { bindConnectAuthorization } from './authorization-binding';

const subject = '123e4567-e89b-12d3-a456-426614174000';

const request = (
  externalIdentity: { provider: 'supabase'; subject } | null = { provider: 'supabase', subject },
): ConnectTrustedRequestContext =>
  Object.freeze({
    principal: Object.freeze({
      type: 'connect_integration' as const,
      integrationId: 'connect-prod',
      displayName: 'Connect',
      status: 'active' as const,
    }),
    request: Object.freeze({
      integration: Object.freeze({
        type: 'connect_integration' as const,
        integrationId: 'connect-prod',
        displayName: 'Connect',
        status: 'active' as const,
      }),
      requestId: 'request-1',
      operation: Object.freeze({ resource: 'saved_business' as const, operation: 'read' as const }),
      externalIdentity,
      input: undefined,
    }),
    assertion: Object.freeze({
      sub: 'connect-prod',
      iss: 'ghm-service-auth' as const,
      aud: 'ghm-connect-service' as const,
      iat: 1,
      exp: 301,
      jti: 'request-1',
    }),
  });

const operation: ConnectGovernedOperation = Object.freeze({
  resource: 'saved_business',
  operation: 'read',
  capability: 'saved_business.read',
});

const identity: ConnectIdentityAdapter = {
  async resolve() {
    return {
      outcome: 'resolved' as const,
      created: false as const,
      mapping: {
        id: 1,
        provider: 'supabase',
        subject,
        accountId: 7,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    };
  },
};

const accounts: AccountAuthStateStore = {
  async getAccountAuthState() {
    return {
      accountId: 7,
      accountStatus: 'active' as const,
      role: 'customer' as const,
      isSystemAdmin: false,
    };
  },
};

test('resolves external identity and derives current GHM authorization context', async () => {
  const result = await bindConnectAuthorization(request(), operation, { identity, accounts });
  assert.equal(result.context.userId, 7);
  assert.equal(result.context.role, 'customer');
  assert.equal(result.capability, 'saved_business.read');
});

test('never enables identity bootstrap during authorization binding', async () => {
  let allowBootstrap: boolean | undefined;
  const identityWithObservation: ConnectIdentityAdapter = {
    async resolve(_subject, options) {
      allowBootstrap = options?.allowBootstrap;
      return identity.resolve(_subject, options);
    },
  };
  await bindConnectAuthorization(request(), operation, {
    identity: identityWithObservation,
    accounts,
  });
  assert.equal(allowBootstrap, false);
});

test('fails closed when the request has no end-user identity', async () => {
  await assert.rejects(
    () => bindConnectAuthorization(request(null), operation, { identity, accounts }),
    /End-user identity is required/,
  );
});

test('fails closed for an unmapped identity', async () => {
  const unmapped: ConnectIdentityAdapter = {
    async resolve() {
      return { outcome: 'unmapped', mapping: null, created: false };
    },
  };
  await assert.rejects(
    () => bindConnectAuthorization(request(), operation, { identity: unmapped, accounts }),
    /not mapped/,
  );
});

test('fails closed for an inactive account', async () => {
  const inactive: AccountAuthStateStore = {
    async getAccountAuthState() {
      return { accountId: 7, accountStatus: 'disabled', role: 'customer', isSystemAdmin: false };
    },
  };
  await assert.rejects(
    () => bindConnectAuthorization(request(), operation, { identity, accounts: inactive }),
    /not active/,
  );
});

test('fails closed when the resolved operation does not match the trusted request', async () => {
  const mismatched: ConnectGovernedOperation = Object.freeze({
    resource: 'profile',
    operation: 'read',
    capability: 'profile.read',
  });
  await assert.rejects(
    () => bindConnectAuthorization(request(), mismatched, { identity, accounts }),
    /does not match request/,
  );
});

test('system-admin authorization state is derived by GHM, not Connect input', async () => {
  const adminAccounts: AccountAuthStateStore = {
    async getAccountAuthState() {
      return { accountId: 7, accountStatus: 'active', role: 'customer', isSystemAdmin: true };
    },
  };
  const result = await bindConnectAuthorization(request(), operation, {
    identity,
    accounts: adminAccounts,
  });
  assert.equal(result.context.userId, 7);
  assert.equal(result.context.role, 'admin');
});

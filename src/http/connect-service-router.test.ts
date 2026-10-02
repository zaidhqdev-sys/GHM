import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { registerConnectServiceRoutes } from './connect-service-router';
import type { SavedBusinessService } from '../resources/saved-business/contracts';
import type { ConnectIntegrationLifecycleRepository } from '../integrations/connect/integration-lifecycle';
import type { ConnectIdentityAdapter } from '../integrations/connect/identity-adapter';
import type { AccountAuthStateStore } from '../auth/ghm-bearer';
import type { ConnectServiceAssertionService } from '../integrations/connect/service-assertion';

const start = async (deps: {
  assertionService: ConnectServiceAssertionService;
  lifecycle: ConnectIntegrationLifecycleRepository;
  identity: ConnectIdentityAdapter;
  accounts: AccountAuthStateStore;
  savedBusinesses: SavedBusinessService;
}) => {
  const app = createApp({
    savedBusinessService: deps.savedBusinesses,
    connectService: {
      assertionService: deps.assertionService,
      lifecycle: deps.lifecycle,
      identity: deps.identity,
      accounts: deps.accounts,
    },
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const assertion = (integrationId = 'connect-test', requestId = 'request-1'): ConnectServiceAssertionService => ({
  sign: () => 'unused',
  verify: (token: string) => {
    if (token !== 'valid') throw new Error('invalid assertion');
    return {
      integrationId,
      requestId,
      claims: { sub: integrationId, iss: 'ghm-service-auth', aud: 'ghm-connect-service', iat: 1, exp: 301, jti: requestId },
    };
  },
});

const lifecycle: ConnectIntegrationLifecycleRepository = {
  get: async (id) => id === 'connect-test' ? {
    id, displayName: 'Connect Test', status: 'active',
    createdAt: new Date(), updatedAt: new Date(), disabledAt: null, revokedAt: null,
  } : null,
};

const identity: ConnectIdentityAdapter = {
  resolve: async (subject) => ({
    outcome: 'resolved', created: false,
    mapping: { id: 1, provider: 'supabase', subject, accountId: 42, createdAt: new Date(), updatedAt: new Date() },
  }),
};

const accounts: AccountAuthStateStore = {
  getAccountAuthState: async (accountId) => ({ accountId, accountStatus: 'active', role: 'customer', isSystemAdmin: false }),
};

const service = (calls: string[]): SavedBusinessService => ({
  listSavedBusinesses: async () => { calls.push('list'); return []; },
  getSavedBusiness: async (_context, id) => { calls.push(`get:${id}`); return null; },
  createSavedBusiness: async () => { calls.push('create'); throw new Error('must not be called'); },
  deleteSavedBusiness: async () => { calls.push('delete'); },
});

const body = (input?: unknown) => ({
  operation: { resource: 'saved_business', operation: 'read' },
  externalIdentity: { provider: 'supabase', subject: '550e8400-e29b-41d4-a716-446655440000' },
  ...(input !== undefined ? { input } : {}),
});

test('Connect service read route executes the full governed chain', async () => {
  const calls: string[] = [];
  const { server, baseUrl } = await start({ assertionService: assertion(), lifecycle, identity, accounts, savedBusinesses: service(calls) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, {
      method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(body({ savedBusinessId: 7 })),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: null });
    assert.deepEqual(calls, ['get:7']);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route rejects browser-originated requests', async () => {
  const calls: string[] = [];
  const { server, baseUrl } = await start({ assertionService: assertion(), lifecycle, identity, accounts, savedBusinesses: service(calls) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, {
      method: 'POST', headers: { authorization: 'Bearer valid', origin: 'https://example.com', 'content-type': 'application/json' }, body: JSON.stringify(body()),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
    assert.deepEqual(calls, []);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route rejects missing service credential', async () => {
  const { server, baseUrl } = await start({ assertionService: assertion(), lifecycle, identity, accounts, savedBusinesses: service([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route fails closed for inactive integration', async () => {
  const inactive: ConnectIntegrationLifecycleRepository = { get: async () => ({ ...(await lifecycle.get('connect-test'))!, status: 'disabled' }) };
  const calls: string[] = [];
  const { server, baseUrl } = await start({ assertionService: assertion(), lifecycle: inactive, identity, accounts, savedBusinesses: service(calls) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(response.status, 401);
    assert.deepEqual(calls, []);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route rejects unsupported mutation capability', async () => {
  const calls: string[] = [];
  const { server, baseUrl } = await start({ assertionService: assertion(), lifecycle, identity, accounts, savedBusinesses: service(calls) });
  const mutationBody = { ...body({ businessId: 9 }), operation: { resource: 'saved_business', operation: 'create' } };
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(mutationBody) });
    assert.equal(response.status, 403);
    assert.deepEqual(calls, []);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route fails closed for unmapped identity', async () => {
  const unmapped: ConnectIdentityAdapter = { resolve: async () => ({ outcome: 'unmapped', mapping: null, created: false }) };
  const { server, baseUrl } = await start({ assertionService: assertion(), lifecycle, identity: unmapped, accounts, savedBusinesses: service([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(response.status, 401);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route never enables identity bootstrap', async () => {
  let allowBootstrap: boolean | undefined;
  const guarded: ConnectIdentityAdapter = { resolve: async (subject, options) => { allowBootstrap = options?.allowBootstrap; return identity.resolve(subject, options); } };
  const { server, baseUrl } = await start({ assertionService: assertion(), lifecycle, identity: guarded, accounts, savedBusinesses: service([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(response.status, 200);
    assert.equal(allowBootstrap, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route returns invalid request for malformed input', async () => {
  const { server, baseUrl } = await start({ assertionService: assertion(), lifecycle, identity, accounts, savedBusinesses: service([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, {
      method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
      body: JSON.stringify({ operation: { resource: 'saved_business', operation: 'read' } }),
    });
    assert.equal(response.status, 400);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { registerConnectServiceRoutes } from './connect-service-router';
import type { SavedBusinessService } from '../resources/saved-business/contracts';
import type { CustomerService } from '../resources/customer/contracts';
import type { QuoteService } from '../resources/quote/contracts';
import type { ConnectIntegrationLifecycleRepository } from '../integrations/connect/integration-lifecycle';
import type { ConnectIdentityAdapter } from '../integrations/connect/identity-adapter';
import type { AccountAuthStateStore } from '../auth/ghm-bearer';
import type { ConnectServiceAssertionService } from '../integrations/connect/service-assertion';
import type { ConnectServiceAssertionReplayStore } from '../integrations/connect/service-assertion-replay';

const start = async (deps: {
  assertionService: ConnectServiceAssertionService;
  replayStore: ConnectServiceAssertionReplayStore;
  lifecycle: ConnectIntegrationLifecycleRepository;
  identity: ConnectIdentityAdapter;
  accounts: AccountAuthStateStore;
  savedBusinesses: SavedBusinessService;
  customers: CustomerService;
  quotes: QuoteService;
}) => {
  const app = createApp({
    savedBusinessService: deps.savedBusinesses,
    customerService: deps.customers,
    quoteService: deps.quotes,
    connectService: {
      assertionService: deps.assertionService,
      replayStore: deps.replayStore,
      lifecycle: deps.lifecycle,
      identity: deps.identity,
      accounts: deps.accounts,
      customers: deps.customers,
      quotes: deps.quotes,
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

const replayStore = (): ConnectServiceAssertionReplayStore => {
  const seen = new Set<string>();
  return { consume: async (requestId) => { if (seen.has(requestId)) return false; seen.add(requestId); return true; } };
};

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

const quoteService = (calls: string[]): QuoteService => {
  const result = {
    id: 7,
    accountId: 42,
    customerId: 9,
    customerName: 'Alice',
    customerPhone: null,
    customerEmail: null,
    description: 'Test',
    amount: 100,
    followUpDate: '2026-10-10',
    status: 'active' as const,
    reminderId: null,
    reminderDate: null,
    notes: '',
    lineItems: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    listQuotes: async () => { calls.push('list'); return [result]; },
    getQuote: async (_context, id) => { calls.push(`get:${id}`); return { ...result, id }; },
    createQuote: async (_context, input) => { calls.push(`create:${input.customerId}`); return { ...result, id: 8 }; },
    setQuoteStatus: async (_context, id, status) => { calls.push(`status:${id}:${status}`); return { ...result, id, status }; },
    setQuoteNotes: async (_context, id, notes) => { calls.push(`notes:${id}:${notes}`); return { ...result, id, notes }; },
  };
};

const customerService = (calls: string[]): CustomerService => ({
  listCustomers: async (_context, status) => { calls.push(`list:${status ?? 'all'}`); return []; },
  getCustomer: async (_context, id) => { calls.push(`get:${id}`); return null; },
  createCustomer: async (_context, input) => { calls.push(`create:${input.name}`); throw new Error('test create result'); },
  archiveCustomer: async (_context, id) => { calls.push(`archive:${id}`); throw new Error('test archive result'); },
  restoreCustomer: async (_context, id) => { calls.push(`restore:${id}`); throw new Error('test restore result'); },
});

const body = (input?: unknown) => ({
  operation: { resource: 'saved_business', operation: 'read' },
  externalIdentity: { provider: 'supabase', subject: '550e8400-e29b-41d4-a716-446655440000' },
  ...(input !== undefined ? { input } : {}),
});

test('Connect service read route executes the full governed chain', async () => {
  const calls: string[] = [];
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle, identity, accounts, savedBusinesses: service(calls), customers: customerService([]), quotes: quoteService([]) });
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
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle, identity, accounts, savedBusinesses: service(calls), customers: customerService([]), quotes: quoteService([]) });
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
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle, identity, accounts, savedBusinesses: service([]), customers: customerService([]), quotes: quoteService([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route fails closed for inactive integration', async () => {
  const inactive: ConnectIntegrationLifecycleRepository = { get: async () => ({ ...(await lifecycle.get('connect-test'))!, status: 'disabled' }) };
  const calls: string[] = [];
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle: inactive, identity, accounts, savedBusinesses: service(calls), customers: customerService([]), quotes: quoteService([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(response.status, 401);
    assert.deepEqual(calls, []);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route rejects unsupported mutation capability', async () => {
  const calls: string[] = [];
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle, identity, accounts, savedBusinesses: service(calls), customers: customerService([]), quotes: quoteService([]) });
  const mutationBody = { ...body({ businessId: 9 }), operation: { resource: 'saved_business', operation: 'create' } };
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(mutationBody) });
    assert.equal(response.status, 403);
    assert.deepEqual(calls, []);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route fails closed for unmapped identity', async () => {
  const unmapped: ConnectIdentityAdapter = { resolve: async () => ({ outcome: 'unmapped', mapping: null, created: false }) };
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle, identity: unmapped, accounts, savedBusinesses: service([]), customers: customerService([]), quotes: quoteService([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(response.status, 401);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route never enables identity bootstrap', async () => {
  let allowBootstrap: boolean | undefined;
  const guarded: ConnectIdentityAdapter = { resolve: async (subject, options) => { allowBootstrap = options?.allowBootstrap; return identity.resolve(subject, options); } };
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle, identity: guarded, accounts, savedBusinesses: service([]), customers: customerService([]), quotes: quoteService([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify(body()) });
    assert.equal(response.status, 200);
    assert.equal(allowBootstrap, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route returns invalid request for malformed input', async () => {
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle, identity, accounts, savedBusinesses: service([]), customers: customerService([]), quotes: quoteService([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, {
      method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
      body: JSON.stringify({ operation: { resource: 'saved_business', operation: 'read' } }),
    });
    assert.equal(response.status, 400);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route dispatches Customer read through the governed chain', async () => {
  const calls: string[] = [];
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle, identity, accounts, savedBusinesses: service([]), customers: customerService(calls), quotes: quoteService([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, {
      method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
      body: JSON.stringify({ operation: { resource: 'customer', operation: 'read' }, externalIdentity: { provider: 'supabase', subject: '550e8400-e29b-41d4-a716-446655440000' }, input: { customerId: 7 } }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: null });
    assert.deepEqual(calls, ['get:7']);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route reaches Customer create capability but preserves service errors', async () => {
  const calls: string[] = [];
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle, identity, accounts, savedBusinesses: service([]), customers: customerService(calls), quotes: quoteService([]) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, {
      method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
      body: JSON.stringify({ operation: { resource: 'customer', operation: 'create' }, externalIdentity: { provider: 'supabase', subject: '550e8400-e29b-41d4-a716-446655440000' }, input: { name: 'Alice' } }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(calls, ['create:Alice']);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Connect service route dispatches Quote read through the governed chain', async () => {
  const calls: string[] = [];
  const { server, baseUrl } = await start({ assertionService: assertion(), replayStore: replayStore(), lifecycle, identity, accounts, savedBusinesses: service([]), customers: customerService([]), quotes: quoteService(calls) });
  try {
    const response = await fetch(`${baseUrl}/api/v1/connect/service`, { method: 'POST', headers: { authorization: 'Bearer valid', 'content-type': 'application/json' }, body: JSON.stringify({ operation: { resource: 'quote', operation: 'read' }, externalIdentity: { provider: 'supabase', subject: '550e8400-e29b-41d4-a716-446655440000' }, input: { quoteId: 7 } }) });
    const payload = await response.json() as { result: { id: number; accountId: number; customerId: number; status: string } };
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.result.id, 7);
    assert.equal(payload.result.accountId, 42);
    assert.equal(payload.result.customerId, 9);
    assert.equal(payload.result.status, 'active');
    assert.deepEqual(calls, ['get:7']);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

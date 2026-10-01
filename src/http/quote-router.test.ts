import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor as es256TokenFor } from './test-resource-auth';
import { AuthContext } from '../auth/authorization';
import type { Quote, QuoteService } from '../resources/quote/contracts';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';

const startServer = async (quoteService: QuoteService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    quoteService,
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const fixture = (context: AuthContext, overrides: Partial<Quote> = {}): Quote => ({
  id: 201,
  accountId: context.userId,
  customerId: 101,
  customerName: 'Acme Customer',
  customerPhone: '+27123456789',
  customerEmail: 'customer@example.com',
  description: 'Website, hosting',
  amount: 25000,
  followUpDate: '2026-10-05',
  status: 'active',
  reminderId: null,
  reminderDate: null,
  notes: '',
  lineItems: [{
    id: 301,
    quoteId: 201,
    description: 'Website',
    quantity: 1,
    unitPrice: 25000,
    catalogItemId: null,
    createdAt: new Date('2026-09-10T00:00:00.000Z'),
  }],
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
  ...overrides,
});

const tokenFor = es256TokenFor;

test('quote list route requires authentication', async () => {
  const service = { listQuotes: async () => { throw new Error('must not be called'); } } as unknown as QuoteService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/quotes`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('quote list and get bind authenticated context', async () => {
  let receivedContext: AuthContext | undefined;
  const quote = fixture({ userId: 42, role: 'business' });
  const service = {
    listQuotes: async (context: AuthContext) => { receivedContext = context; return [quote]; },
    getQuote: async (context: AuthContext, id: number) => { receivedContext = context; return id === 201 ? quote : null; },
  } as unknown as QuoteService;
  const { server, baseUrl } = await startServer(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` };
    const list = await fetch(`${baseUrl}/api/v1/quotes`, { headers });
    assert.equal(list.status, 200);
    assert.equal((await list.json() as { quotes: Quote[] }).quotes[0].id, 201);
    const get = await fetch(`${baseUrl}/api/v1/quotes/201`, { headers });
    assert.equal(get.status, 200);
    assert.equal((await get.json() as { quote: Quote }).quote.id, 201);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('quote get rejects invalid ids and does not call service', async () => {
  let called = false;
  const service = { getQuote: async () => { called = true; throw new Error('must not be called'); } } as unknown as QuoteService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/quotes/nope`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('quote create rejects server-owned fields', async () => {
  let called = false;
  const service = { createQuote: async () => { called = true; throw new Error('must not be called'); } } as unknown as QuoteService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/quotes`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        customerId: 101,
        lineItems: [{ description: 'Website', quantity: 1, unitPrice: 25000 }],
        followUpDate: '2026-10-05',
        accountId: 999,
        amount: 1,
        status: 'won',
      }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('quote create accepts only canonical input and binds context', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;
  const quote = fixture({ userId: 42, role: 'business' });
  const service = {
    createQuote: async (context: AuthContext, input: unknown) => {
      receivedContext = context;
      receivedInput = input;
      return quote;
    },
  } as unknown as QuoteService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/quotes`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        customerId: 101,
        lineItems: [{ description: ' Website ', quantity: 1, unitPrice: 25000 }],
        followUpDate: '2026-10-05',
      }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.deepEqual(receivedInput, {
      customerId: 101,
      lineItems: [{ description: ' Website ', quantity: 1, unitPrice: 25000 }],
      followUpDate: '2026-10-05',
    });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('quote patch maps status and notes to explicit domain operations', async () => {
  const calls: string[] = [];
  const quote = fixture({ userId: 42, role: 'business' });
  const service = {
    setQuoteStatus: async (context: AuthContext, id: number, status: string) => {
      calls.push(`status:${context.userId}:${id}:${status}`);
      return fixture(context, { id, status: status as Quote['status'] });
    },
    setQuoteNotes: async (context: AuthContext, id: number, notes: string) => {
      calls.push(`notes:${context.userId}:${id}:${notes}`);
      return fixture(context, { id, notes });
    },
  } as unknown as QuoteService;
  const { server, baseUrl } = await startServer(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`, 'content-type': 'application/json' };
    assert.equal((await fetch(`${baseUrl}/api/v1/quotes/201`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'won' }) })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/v1/quotes/201`, { method: 'PATCH', headers, body: JSON.stringify({ notes: 'Call tomorrow' }) })).status, 200);
    assert.deepEqual(calls, ['status:42:201:won', 'notes:42:201:Call tomorrow']);
    void quote;
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('quote patch rejects arbitrary mutation fields', async () => {
  let called = false;
  const service = {
    setQuoteStatus: async () => { called = true; throw new Error('must not be called'); },
    setQuoteNotes: async () => { called = true; throw new Error('must not be called'); },
  } as unknown as QuoteService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/quotes/201`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 999999 }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

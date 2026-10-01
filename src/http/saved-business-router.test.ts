import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor as es256TokenFor } from './test-resource-auth';
import { AuthContext } from '../auth/authorization';
import type { SavedBusiness, SavedBusinessService } from '../resources/saved-business/contracts';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';

const startServer = async (savedBusinessService: SavedBusinessService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    savedBusinessService,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const fixture = (context: AuthContext, overrides: Partial<SavedBusiness> = {}): SavedBusiness => ({
  id: 101,
  accountId: context.userId,
  businessId: 55,
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  ...overrides,
});

const tokenFor = es256TokenFor;

test('saved business list route requires authentication', async () => {
  const service = { listSavedBusinesses: async () => { throw new Error('must not be called'); } } as unknown as SavedBusinessService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/saved-businesses`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('saved business list route binds authenticated context', async () => {
  let receivedContext: AuthContext | undefined;
  const service = {
    listSavedBusinesses: async (context: AuthContext) => {
      receivedContext = context;
      return [fixture(context)];
    },
  } as unknown as SavedBusinessService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/saved-businesses`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    const body = await response.json() as { savedBusinesses: SavedBusiness[] };
    assert.equal(body.savedBusinesses[0].accountId, 42);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('saved business get route rejects invalid ids before service execution', async () => {
  let called = false;
  const service = {
    getSavedBusiness: async () => {
      called = true;
      throw new Error('must not be called');
    },
  } as unknown as SavedBusinessService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/saved-businesses/not-an-id`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('saved business get route returns not found without disclosing another account', async () => {
  const service = { getSavedBusiness: async () => null } as unknown as SavedBusinessService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/saved-businesses/101`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 99, role: 'business' })}` },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('saved business create route rejects server-owned fields', async () => {
  let called = false;
  const service = {
    createSavedBusiness: async () => {
      called = true;
      throw new Error('must not be called');
    },
  } as unknown as SavedBusinessService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/saved-businesses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 55, accountId: 999, id: 777 }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('saved business create route binds authenticated context and canonical input', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;
  const service = {
    createSavedBusiness: async (context: AuthContext, input: unknown) => {
      receivedContext = context;
      receivedInput = input;
      return fixture(context);
    },
  } as unknown as SavedBusinessService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/saved-businesses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ businessId: 55 }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.deepEqual(receivedInput, { businessId: 55 });
    const body = await response.json() as { savedBusiness: SavedBusiness };
    assert.equal(body.savedBusiness.businessId, 55);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('saved business delete route maps to explicit domain delete operation', async () => {
  let call: string | undefined;
  const service = {
    deleteSavedBusiness: async (context: AuthContext, id: number) => {
      call = `${context.userId}:${id}`;
    },
  } as unknown as SavedBusinessService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/saved-businesses/101`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 204);
    assert.equal(call, '42:101');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('saved business delete route rejects invalid ids', async () => {
  let called = false;
  const service = {
    deleteSavedBusiness: async () => { called = true; },
  } as unknown as SavedBusinessService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/saved-businesses/0`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

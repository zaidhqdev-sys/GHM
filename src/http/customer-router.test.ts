import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor as es256TokenFor } from './test-resource-auth';
import { AuthContext } from '../auth/authorization';
import type { Customer, CustomerService } from '../resources/customer/contracts';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';

const startServer = async (customerService: CustomerService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    customerService,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const fixture = (context: AuthContext, overrides: Partial<Customer> = {}): Customer => ({
  id: 101,
  accountId: context.userId,
  name: 'Acme Customer',
  phone: '+27123456789',
  email: 'customer@example.com',
  status: 'active',
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
  ...overrides,
});

const tokenFor = es256TokenFor;

test('customer list route requires authentication', async () => {
  const service = { listCustomers: async () => { throw new Error('must not be called'); } } as unknown as CustomerService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/customers`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('customer list route binds context and optional status filter', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedStatus: string | undefined;
  const customer = fixture({ userId: 42, role: 'business' });
  const service = {
    listCustomers: async (context: AuthContext, status?: 'active' | 'archived') => {
      receivedContext = context;
      receivedStatus = status;
      return [customer];
    },
  } as unknown as CustomerService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/customers?status=active`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.equal(receivedStatus, 'active');
    const body = await response.json() as { customers: Customer[] };
    assert.equal(body.customers[0].id, 101);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('customer list route rejects invalid status', async () => {
  let called = false;
  const service = {
    listCustomers: async () => {
      called = true;
      throw new Error('must not be called');
    },
  } as unknown as CustomerService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/customers?status=unknown`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('customer get route rejects invalid ids before service execution', async () => {
  let called = false;
  const service = {
    getCustomer: async () => {
      called = true;
      throw new Error('must not be called');
    },
  } as unknown as CustomerService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/customers/not-an-id`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('customer get route returns not found without disclosing another account', async () => {
  const service = { getCustomer: async () => null } as unknown as CustomerService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/customers/101`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 99, role: 'business' })}` },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('customer create route rejects server-owned fields and binds authenticated context', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;
  const service = {
    createCustomer: async (context: AuthContext, input: unknown) => {
      receivedContext = context;
      receivedInput = input;
      return fixture(context);
    },
  } as unknown as CustomerService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/customers`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Acme Customer',
        phone: '+27123456789',
        email: 'customer@example.com',
        accountId: 999,
        status: 'archived',
      }),
    });
    assert.equal(response.status, 400);
    assert.equal(receivedContext, undefined);
    assert.equal(receivedInput, undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('customer create route returns the created customer', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;
  const service = {
    createCustomer: async (context: AuthContext, input: unknown) => {
      receivedContext = context;
      receivedInput = input;
      return fixture(context);
    },
  } as unknown as CustomerService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/customers`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: ' Acme Customer ',
        phone: ' +27123456789 ',
        email: ' customer@example.com ',
      }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.deepEqual(receivedInput, {
      name: ' Acme Customer ',
      phone: ' +27123456789 ',
      email: ' customer@example.com ',
    });
    const body = await response.json() as { customer: Customer };
    assert.equal(body.customer.accountId, 42);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('customer patch route maps archived and active status to explicit domain operations', async () => {
  const calls: string[] = [];
  const service = {
    archiveCustomer: async (context: AuthContext, id: number) => {
      calls.push(`archive:${context.userId}:${id}`);
      return fixture(context, { id, status: 'archived' });
    },
    restoreCustomer: async (context: AuthContext, id: number) => {
      calls.push(`restore:${context.userId}:${id}`);
      return fixture(context, { id, status: 'active' });
    },
  } as unknown as CustomerService;
  const { server, baseUrl } = await startServer(service);
  try {
    const headers = {
      authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
      'content-type': 'application/json',
    };
    const archiveResponse = await fetch(`${baseUrl}/api/v1/customers/101`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'archived' }),
    });
    assert.equal(archiveResponse.status, 200);

    const restoreResponse = await fetch(`${baseUrl}/api/v1/customers/101`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'active' }),
    });
    assert.equal(restoreResponse.status, 200);
    assert.deepEqual(calls, ['archive:42:101', 'restore:42:101']);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('customer patch route rejects arbitrary field mutation', async () => {
  let called = false;
  const service = {
    archiveCustomer: async () => { called = true; throw new Error('must not be called'); },
    restoreCustomer: async () => { called = true; throw new Error('must not be called'); },
  } as unknown as CustomerService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/customers/101`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name: 'Attempted mutation' }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

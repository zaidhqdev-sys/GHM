import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import { AuthContext } from '../auth/authorization';
import { config } from '../config';
import type { Enquiry, EnquiryService } from '../resources/enquiry/contracts';

const enquiryFixture = (overrides: Partial<Enquiry> = {}): Enquiry => ({
  id: 501,
  businessId: 700,
  customerId: 42,
  customerName: 'Customer One',
  customerPhone: '+27123456789',
  customerEmail: 'customer@example.com',
  project: 'Kitchen renovation',
  description: 'Renovation project for a residential kitchen and related finishes.',
  city: 'Durban',
  budgetMin: 50000,
  budgetMax: 100000,
  urgency: 'standard',
  source: 'marketplace',
  status: 'new',
  createdAt: new Date('2026-09-11T00:00:00.000Z'),
  updatedAt: new Date('2026-09-11T00:00:00.000Z'),
  ...overrides,
});

const startServer = async (enquiryService: EnquiryService) => {
  const server = http.createServer(createApp({
    businessIdentityService: {} as never,
    projectService: {} as never,
    publicProjectService: {} as never,
    enquiryService,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const tokenFor = (context: AuthContext): string =>
  jwt.sign({ userId: context.userId, role: context.role }, config.jwtSecret);

const createInput = {
  businessId: 700,
  customerName: ' Customer One ',
  customerPhone: '+27123456789',
  customerEmail: 'customer@example.com',
  project: ' Kitchen renovation ',
  description: ' Renovation project for a residential kitchen and related finishes. ',
  city: ' Durban ',
  budgetMin: 50000,
  budgetMax: 100000,
  urgency: 'urgent',
};

test('Enquiry create route requires authentication', async () => {
  const service = { createEnquiry: async () => { throw new Error('must not be called'); } } as unknown as EnquiryService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/enquiries`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(createInput),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Enquiry create route binds authenticated customer context and rejects server-owned identity fields', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;
  const service: EnquiryService = {
    createEnquiry: async (context, input) => {
      receivedContext = context;
      receivedInput = input;
      return enquiryFixture({ customerId: context.userId });
    },
    getOwnEnquiry: async () => null,
    getReceivedEnquiry: async () => null,
    updateReceivedEnquiryStatus: async () => enquiryFixture(),
  };
  const { server, baseUrl } = await startServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'customer' });
    const response = await fetch(`${baseUrl}/api/v1/enquiries`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...createInput, customerId: 999, status: 'won' }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(receivedContext, undefined);
    assert.equal(receivedInput, undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Enquiry create route returns created enquiry and binds customer context', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;
  const service: EnquiryService = {
    createEnquiry: async (context, input) => {
      receivedContext = context;
      receivedInput = input;
      return enquiryFixture({ customerId: context.userId });
    },
    getOwnEnquiry: async () => null,
    getReceivedEnquiry: async () => null,
    updateReceivedEnquiryStatus: async () => enquiryFixture(),
  };
  const { server, baseUrl } = await startServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'customer' });
    const response = await fetch(`${baseUrl}/api/v1/enquiries`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(createInput),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(receivedContext, { userId: 42, role: 'customer' });
    assert.deepEqual(receivedInput, createInput);
    const body = await response.json() as { enquiry: Enquiry };
    assert.equal(body.enquiry.customerId, 42);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Enquiry own-read route binds customer context and returns only service result', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedId: number | undefined;
  const enquiry = enquiryFixture();
  const service: EnquiryService = {
    createEnquiry: async () => enquiry,
    getOwnEnquiry: async (context, enquiryId) => {
      receivedContext = context;
      receivedId = enquiryId;
      return enquiry;
    },
    getReceivedEnquiry: async () => null,
    updateReceivedEnquiryStatus: async () => enquiry,
  };
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/enquiries/501`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'customer' });
    assert.equal(receivedId, 501);
    assert.equal((await response.json() as { enquiry: Enquiry }).enquiry.id, 501);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Enquiry received-read route uses the separate recipient-owner operation', async () => {
  let called = false;
  let receivedContext: AuthContext | undefined;
  const enquiry = enquiryFixture();
  const service: EnquiryService = {
    createEnquiry: async () => enquiry,
    getOwnEnquiry: async () => { throw new Error('must not be called'); },
    getReceivedEnquiry: async (context, enquiryId) => {
      called = true;
      receivedContext = context;
      assert.equal(enquiryId, 501);
      return enquiry;
    },
    updateReceivedEnquiryStatus: async () => enquiry,
  };
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/enquiries/received/501`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 700, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.equal(called, true);
    assert.deepEqual(receivedContext, { userId: 700, role: 'business' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Enquiry status route accepts only status mutation fields', async () => {
  let called = false;
  const service: EnquiryService = {
    createEnquiry: async () => enquiryFixture(),
    getOwnEnquiry: async () => null,
    getReceivedEnquiry: async () => null,
    updateReceivedEnquiryStatus: async (_context, enquiryId, input) => {
      called = true;
      assert.equal(enquiryId, 501);
      assert.deepEqual(input, { status: 'contacted' });
      return enquiryFixture({ status: 'contacted' });
    },
  };
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/enquiries/received/501/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tokenFor({ userId: 700, role: 'business' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'contacted', customerId: 999 }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Enquiry exposes no delete route', async () => {
  const service = {} as EnquiryService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/enquiries/501`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(response.status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor as es256TokenFor } from './test-resource-auth';
import { AuthContext } from '../auth/authorization';
import type { SupportRequest, SupportRequestMessage, SupportRequestService } from '../resources/support-request/contracts';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';

const startServer = async (service: SupportRequestService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    supportRequestService: service,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const tokenFor = es256TokenFor;

const requestFixture = (): SupportRequest => ({
  id: 10, accountId: 42, businessId: null, category: 'technical',
  subject: 'Login issue', description: 'Unable to complete login.',
  priority: 'normal', status: 'open', resolutionSummary: null,
  resolvedAt: null, closedAt: null, createdAt: new Date(), updatedAt: new Date(),
});

const messageFixture = (): SupportRequestMessage => ({
  id: 11, supportRequestId: 10, accountId: 42,
  senderKind: 'customer', body: 'Please help.', createdAt: new Date(),
});

const service = (overrides: Partial<SupportRequestService> = {}): SupportRequestService => ({
  createSupportRequest: async () => requestFixture(),
  getSupportRequest: async () => requestFixture(),
  listSupportRequests: async () => [requestFixture()],
  updateSupportRequestStatus: async () => ({ ...requestFixture(), status: 'resolved' }),
  getMessages: async () => [messageFixture()],
  replyAsCustomer: async () => messageFixture(),
  replyAsAdmin: async () => ({ ...messageFixture(), senderKind: 'admin' }),
  ...overrides,
});

test('support request list binds authenticated context and filters', async () => {
  let received: unknown;
  const { server, baseUrl } = await startServer(service({
    listSupportRequests: async (context, options) => {
      received = { context, options };
      return [requestFixture()];
    },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests?status=open&limit=10`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      context: { userId: 42, role: 'customer' },
      options: { status: 'open', limit: 10 },
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('support request list rejects invalid filters before service execution', async () => {
  let called = false;
  const { server, baseUrl } = await startServer(service({
    listSupportRequests: async () => { called = true; return []; },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests?status=bogus`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('support request read requires authentication and maps missing request', async () => {
  const { server, baseUrl } = await startServer(service({
    getSupportRequest: async () => null,
  }));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/v1/support-requests/10`);
    assert.equal(unauthenticated.status, 401);
    const missing = await fetch(`${baseUrl}/api/v1/support-requests/10`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(missing.status, 404);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('support request read rejects invalid ids before service execution', async () => {
  let called = false;
  const { server, baseUrl } = await startServer(service({
    getSupportRequest: async () => { called = true; return requestFixture(); },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests/0`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('customer can create a support request with canonical fields only', async () => {
  let received: unknown;
  const { server, baseUrl } = await startServer(service({
    createSupportRequest: async (context, input) => {
      received = { context, input };
      return requestFixture();
    },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'technical', subject: 'Login issue', description: 'Unable to complete login.' }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(received, {
      context: { userId: 42, role: 'customer' },
      input: { category: 'technical', subject: 'Login issue', description: 'Unable to complete login.' },
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('business and admin cannot use customer create route', async () => {
  for (const role of ['business', 'admin'] as const) {
    const { server, baseUrl } = await startServer(service({
      createSupportRequest: async () => { throw new Error('must not be called'); },
    }));
    try {
      const response = await fetch(`${baseUrl}/api/v1/support-requests`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenFor({ userId: 42, role })}`, 'content-type': 'application/json' },
        body: JSON.stringify({ category: 'technical', subject: 'Login issue', description: 'Unable to complete login.' }),
      });
      assert.equal(response.status, 403);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  }
});

test('support request create rejects server-owned fields', async () => {
  let called = false;
  const { server, baseUrl } = await startServer(service({
    createSupportRequest: async () => { called = true; return requestFixture(); },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'technical', subject: 'Login issue', description: 'Unable to complete login.', status: 'closed' }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('only admin can update support request status', async () => {
  let received: unknown;
  const { server, baseUrl } = await startServer(service({
    updateSupportRequestStatus: async (context, id, input) => {
      received = { context, id, input };
      return { ...requestFixture(), status: input.status };
    },
  }));
  try {
    const customer = await fetch(`${baseUrl}/api/v1/support-requests/10/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', resolutionSummary: 'Fixed.' }),
    });
    assert.equal(customer.status, 403);
    const admin = await fetch(`${baseUrl}/api/v1/support-requests/10/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'admin' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', resolutionSummary: 'Fixed.' }),
    });
    assert.equal(admin.status, 200);
    assert.deepEqual(received, {
      context: { userId: 9, role: 'admin' },
      id: 10,
      input: { status: 'resolved', resolutionSummary: 'Fixed.' },
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('support request status rejects arbitrary fields', async () => {
  let called = false;
  const { server, baseUrl } = await startServer(service({
    updateSupportRequestStatus: async () => { called = true; return requestFixture(); },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests/10/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'admin' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', accountId: 999 }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('support request messages bind context and request id', async () => {
  let received: unknown;
  const { server, baseUrl } = await startServer(service({
    getMessages: async (context, requestId) => {
      received = { context, requestId };
      return [messageFixture()];
    },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'admin' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { context: { userId: 9, role: 'admin' }, requestId: 10 });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('message reply dispatches to exact customer or admin operation', async () => {
  let customerCalled = false;
  let adminCalled = false;
  const { server, baseUrl } = await startServer(service({
    replyAsCustomer: async () => { customerCalled = true; return messageFixture(); },
    replyAsAdmin: async () => { adminCalled = true; return { ...messageFixture(), senderKind: 'admin' }; },
  }));
  try {
    const customer = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Customer reply' }),
    });
    assert.equal(customer.status, 201);
    const admin = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'admin' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Admin reply' }),
    });
    assert.equal(admin.status, 201);
    assert.equal(customerCalled, true);
    assert.equal(adminCalled, true);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Business account can create and reply through its authenticated support context', async () => {
  let createdContext: AuthContext | undefined;
  let replyContext: AuthContext | undefined;
  const { server, baseUrl } = await startServer(service({
    createSupportRequest: async (context) => { createdContext = context; return requestFixture(); },
    replyAsCustomer: async (context) => { replyContext = context; return messageFixture(); },
  }));
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 8, role: 'business' })}`, 'content-type': 'application/json' };
    const created = await fetch(`${baseUrl}/api/v1/support-requests`, { method: 'POST', headers, body: JSON.stringify({ category: 'business', subject: 'Business support', description: 'Please help with this business workspace issue.', businessId: 77 }) });
    assert.equal(created.status, 201);
    const replied = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, { method: 'POST', headers, body: JSON.stringify({ body: 'Business account reply' }) });
    assert.equal(replied.status, 201);
    assert.deepEqual(createdContext, { userId: 8, role: 'business' });
    assert.deepEqual(replyContext, { userId: 8, role: 'business' });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('message reply rejects arbitrary fields and invalid ids', async () => {
  let called = false;
  const { server, baseUrl } = await startServer(service({
    replyAsCustomer: async () => { called = true; return messageFixture(); },
  }));
  try {
    const badBody = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Reply', senderKind: 'admin' }),
    });
    assert.equal(badBody.status, 400);
    const badId = await fetch(`${baseUrl}/api/v1/support-requests/0/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Reply' }),
    });
    assert.equal(badId.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('business role can access support routes through account-scoped service context', async () => {
  const calls: string[] = [];
  const { server, baseUrl } = await startServer(service({
    getSupportRequest: async (context) => { calls.push(`read:${context.userId}`); return requestFixture(); },
    listSupportRequests: async (context) => { calls.push(`list:${context.userId}`); return [requestFixture()]; },
    getMessages: async (context) => { calls.push(`messages:${context.userId}`); return [messageFixture()]; },
  }));
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 8, role: 'business' })}` };
    const read = await fetch(`${baseUrl}/api/v1/support-requests/10`, { headers });
    const list = await fetch(`${baseUrl}/api/v1/support-requests`, { headers });
    const messages = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, { headers });
    assert.equal(read.status, 200); assert.equal(list.status, 200); assert.equal(messages.status, 200);
    assert.deepEqual(calls, ['read:8', 'list:8', 'messages:8']);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});ort assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor as es256TokenFor } from './test-resource-auth';
import { AuthContext } from '../auth/authorization';
import type { SupportRequest, SupportRequestMessage, SupportRequestService } from '../resources/support-request/contracts';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';

const startServer = async (service: SupportRequestService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    supportRequestService: service,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const tokenFor = es256TokenFor;

const requestFixture = (): SupportRequest => ({
  id: 10, accountId: 42, businessId: null, category: 'technical',
  subject: 'Login issue', description: 'Unable to complete login.',
  priority: 'normal', status: 'open', resolutionSummary: null,
  resolvedAt: null, closedAt: null, createdAt: new Date(), updatedAt: new Date(),
});

const messageFixture = (): SupportRequestMessage => ({
  id: 11, supportRequestId: 10, accountId: 42,
  senderKind: 'customer', body: 'Please help.', createdAt: new Date(),
});

const service = (overrides: Partial<SupportRequestService> = {}): SupportRequestService => ({
  createSupportRequest: async () => requestFixture(),
  getSupportRequest: async () => requestFixture(),
  listSupportRequests: async () => [requestFixture()],
  updateSupportRequestStatus: async () => ({ ...requestFixture(), status: 'resolved' }),
  getMessages: async () => [messageFixture()],
  replyAsCustomer: async () => messageFixture(),
  replyAsAdmin: async () => ({ ...messageFixture(), senderKind: 'admin' }),
  ...overrides,
});

test('support request list binds authenticated context and filters', async () => {
  let received: unknown;
  const { server, baseUrl } = await startServer(service({
    listSupportRequests: async (context, options) => {
      received = { context, options };
      return [requestFixture()];
    },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests?status=open&limit=10`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      context: { userId: 42, role: 'customer' },
      options: { status: 'open', limit: 10 },
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('support request list rejects invalid filters before service execution', async () => {
  let called = false;
  const { server, baseUrl } = await startServer(service({
    listSupportRequests: async () => { called = true; return []; },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests?status=bogus`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('support request read requires authentication and maps missing request', async () => {
  const { server, baseUrl } = await startServer(service({
    getSupportRequest: async () => null,
  }));
  try {
    const unauthenticated = await fetch(`${baseUrl}/api/v1/support-requests/10`);
    assert.equal(unauthenticated.status, 401);
    const missing = await fetch(`${baseUrl}/api/v1/support-requests/10`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(missing.status, 404);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('support request read rejects invalid ids before service execution', async () => {
  let called = false;
  const { server, baseUrl } = await startServer(service({
    getSupportRequest: async () => { called = true; return requestFixture(); },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests/0`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('customer can create a support request with canonical fields only', async () => {
  let received: unknown;
  const { server, baseUrl } = await startServer(service({
    createSupportRequest: async (context, input) => {
      received = { context, input };
      return requestFixture();
    },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'technical', subject: 'Login issue', description: 'Unable to complete login.' }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(received, {
      context: { userId: 42, role: 'customer' },
      input: { category: 'technical', subject: 'Login issue', description: 'Unable to complete login.' },
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('business and admin cannot use customer create route', async () => {
  for (const role of ['business', 'admin'] as const) {
    const { server, baseUrl } = await startServer(service({
      createSupportRequest: async () => { throw new Error('must not be called'); },
    }));
    try {
      const response = await fetch(`${baseUrl}/api/v1/support-requests`, {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenFor({ userId: 42, role })}`, 'content-type': 'application/json' },
        body: JSON.stringify({ category: 'technical', subject: 'Login issue', description: 'Unable to complete login.' }),
      });
      assert.equal(response.status, 403);
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  }
});

test('support request create rejects server-owned fields', async () => {
  let called = false;
  const { server, baseUrl } = await startServer(service({
    createSupportRequest: async () => { called = true; return requestFixture(); },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'technical', subject: 'Login issue', description: 'Unable to complete login.', status: 'closed' }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('only admin can update support request status', async () => {
  let received: unknown;
  const { server, baseUrl } = await startServer(service({
    updateSupportRequestStatus: async (context, id, input) => {
      received = { context, id, input };
      return { ...requestFixture(), status: input.status };
    },
  }));
  try {
    const customer = await fetch(`${baseUrl}/api/v1/support-requests/10/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', resolutionSummary: 'Fixed.' }),
    });
    assert.equal(customer.status, 403);
    const admin = await fetch(`${baseUrl}/api/v1/support-requests/10/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'admin' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', resolutionSummary: 'Fixed.' }),
    });
    assert.equal(admin.status, 200);
    assert.deepEqual(received, {
      context: { userId: 9, role: 'admin' },
      id: 10,
      input: { status: 'resolved', resolutionSummary: 'Fixed.' },
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('support request status rejects arbitrary fields', async () => {
  let called = false;
  const { server, baseUrl } = await startServer(service({
    updateSupportRequestStatus: async () => { called = true; return requestFixture(); },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests/10/status`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'admin' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'resolved', accountId: 999 }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('support request messages bind context and request id', async () => {
  let received: unknown;
  const { server, baseUrl } = await startServer(service({
    getMessages: async (context, requestId) => {
      received = { context, requestId };
      return [messageFixture()];
    },
  }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'admin' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { context: { userId: 9, role: 'admin' }, requestId: 10 });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('message reply dispatches to exact customer or admin operation', async () => {
  let customerCalled = false;
  let adminCalled = false;
  const { server, baseUrl } = await startServer(service({
    replyAsCustomer: async () => { customerCalled = true; return messageFixture(); },
    replyAsAdmin: async () => { adminCalled = true; return { ...messageFixture(), senderKind: 'admin' }; },
  }));
  try {
    const customer = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Customer reply' }),
    });
    assert.equal(customer.status, 201);
    const admin = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 9, role: 'admin' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Admin reply' }),
    });
    assert.equal(admin.status, 201);
    assert.equal(customerCalled, true);
    assert.equal(adminCalled, true);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('Business account can create and reply through its authenticated support context', async () => {
  let createdContext: AuthContext | undefined;
  let replyContext: AuthContext | undefined;
  const { server, baseUrl } = await startServer(service({
    createSupportRequest: async (context) => { createdContext = context; return requestFixture(); },
    replyAsCustomer: async (context) => { replyContext = context; return messageFixture(); },
  }));
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 8, role: 'business' })}`, 'content-type': 'application/json' };
    const created = await fetch(`${baseUrl}/api/v1/support-requests`, { method: 'POST', headers, body: JSON.stringify({ category: 'business', subject: 'Business support', description: 'Please help with this business workspace issue.', businessId: 77 }) });
    assert.equal(created.status, 201);
    const replied = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, { method: 'POST', headers, body: JSON.stringify({ body: 'Business account reply' }) });
    assert.equal(replied.status, 201);
    assert.deepEqual(createdContext, { userId: 8, role: 'business' });
    assert.deepEqual(replyContext, { userId: 8, role: 'business' });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('message reply rejects arbitrary fields and invalid ids', async () => {
  let called = false;
  const { server, baseUrl } = await startServer(service({
    replyAsCustomer: async () => { called = true; return messageFixture(); },
  }));
  try {
    const badBody = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Reply', senderKind: 'admin' }),
    });
    assert.equal(badBody.status, 400);
    const badId = await fetch(`${baseUrl}/api/v1/support-requests/0/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ body: 'Reply' }),
    });
    assert.equal(badId.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('business role can access support routes through account-scoped service context', async () => {
  const calls: string[] = [];
  const { server, baseUrl } = await startServer(service({
    getSupportRequest: async (context) => { calls.push(`read:${context.userId}`); return requestFixture(); },
    listSupportRequests: async (context) => { calls.push(`list:${context.userId}`); return [requestFixture()]; },
    getMessages: async (context) => { calls.push(`messages:${context.userId}`); return [messageFixture()]; },
  }));
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 8, role: 'business' })}` };
    const read = await fetch(`${baseUrl}/api/v1/support-requests/10`, { headers });
    const list = await fetch(`${baseUrl}/api/v1/support-requests`, { headers });
    const messages = await fetch(`${baseUrl}/api/v1/support-requests/10/messages`, { headers });
    assert.equal(read.status, 200); assert.equal(list.status, 200); assert.equal(messages.status, 200);
    assert.deepEqual(calls, ['read:8', 'list:8', 'messages:8']);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { SupportRequest, SupportRequestMessage, SupportRequestRepository } from './contracts';
import { SupportRequestServiceImpl } from './service';

const customer: AuthContext = { userId: 7, role: 'customer' };
const business: AuthContext = { userId: 8, role: 'business' };
const admin: AuthContext = { userId: 9, role: 'admin' };

const request: SupportRequest = {
  id: 1, accountId: 7, businessId: null, category: 'technical', subject: 'Login issue',
  description: 'Unable to complete login from the workspace.', priority: 'normal', status: 'open',
  resolutionSummary: null, resolvedAt: null, closedAt: null, createdAt: new Date(), updatedAt: new Date(),
};
const message: SupportRequestMessage = {
  id: 1, supportRequestId: 1, accountId: 7, senderKind: 'customer', body: 'Please help.', createdAt: new Date(),
};

const repository = (overrides: Partial<SupportRequestRepository> = {}): SupportRequestRepository => ({
  createSupportRequest: async () => request,
  getSupportRequest: async () => request,
  listSupportRequests: async () => [request],
  updateSupportRequestStatus: async () => ({ ...request, status: 'resolved', resolutionSummary: null }),
  getMessages: async () => [message],
  replyAsCustomer: async () => message,
  replyAsAdmin: async () => ({ ...message, senderKind: 'admin' }),
  ...overrides,
});

test('Support Request service allows customer creation and normalizes text', async () => {
  let received: any;
  const service = new SupportRequestServiceImpl(repository({
    createSupportRequest: async (_context, input) => { received = input; return request; },
  }));
  await service.createSupportRequest(customer, { category: 'technical', subject: '  Login issue  ', description: '  Unable to complete login from the workspace.  ' });
  assert.equal(received.subject, 'Login issue');
  assert.equal(received.description, 'Unable to complete login from the workspace.');
});

test('Support Request service rejects non-customer creation', async () => {
  const service = new SupportRequestServiceImpl(repository());
  await assert.rejects(service.createSupportRequest(business, { category: 'technical', subject: 'Login issue', description: 'Unable to complete login from the workspace.' }), /Customer role required/);
});

test('Support Request service rejects invalid subject and description lengths', async () => {
  const service = new SupportRequestServiceImpl(repository());
  await assert.rejects(service.createSupportRequest(customer, { category: 'technical', subject: 'x', description: 'Unable to complete login from the workspace.' }), /subject must be between 3 and 160 characters/);
  await assert.rejects(service.createSupportRequest(customer, { category: 'technical', subject: 'Login issue', description: 'short' }), /description must be between 10 and 4000 characters/);
});

test('Support Request service requires admin for status changes', async () => {
  const service = new SupportRequestServiceImpl(repository());
  await assert.rejects(service.updateSupportRequestStatus(customer, 1, { status: 'resolved', resolutionSummary: null }), /Insufficient role/);
});

test('Support Request service permits admin status changes', async () => {
  let called = false;
  const service = new SupportRequestServiceImpl(repository({ updateSupportRequestStatus: async () => { called = true; return request; } }));
  await service.updateSupportRequestStatus(admin, 1, { status: 'resolved', resolutionSummary: null });
  assert.equal(called, true);
});

test('Support Request service separates customer and admin reply authority', async () => {
  let customerCalled = false;
  let adminCalled = false;
  const service = new SupportRequestServiceImpl(repository({
    replyAsCustomer: async () => { customerCalled = true; return message; },
    replyAsAdmin: async () => { adminCalled = true; return { ...message, senderKind: 'admin' }; },
  }));
  await service.replyAsCustomer(customer, 1, '  Customer reply  ');
  await service.replyAsAdmin(admin, 1, '  Admin reply  ');
  assert.equal(customerCalled, true);
  assert.equal(adminCalled, true);
  await assert.rejects(service.replyAsCustomer(admin, 1, 'Reply'), /Customer role required/);
  await assert.rejects(service.replyAsAdmin(customer, 1, 'Reply'), /Insufficient role/);
});

test('Support Request service validates request ids and reply body', async () => {
  const service = new SupportRequestServiceImpl(repository());
  await assert.rejects(service.getSupportRequest(customer, 0), /Invalid requestId/);
  await assert.rejects(service.replyAsCustomer(customer, 0, 'Reply'), /Invalid requestId/);
  await assert.rejects(service.replyAsCustomer(customer, 1, ''), /body must be between 1 and 4000 characters/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { Enquiry, EnquiryService } from '../../resources/enquiry/contracts';
import type { ConnectAuthorizedOperation } from './authorization-binding';
import { ConnectEnquiryAdapterError, dispatchConnectEnquiryCapability } from './enquiry-adapter';

const customerContext: AuthContext = { userId: 42, role: 'customer' };
const businessContext: AuthContext = { userId: 84, role: 'business' };
const enquiry = (id = 7): Enquiry => ({
  id, businessId: 12, customerId: 42, customerName: 'Alice', customerPhone: null, customerEmail: null,
  project: 'Website', description: 'Build a website', city: 'Durban', budgetMin: 100, budgetMax: 200,
  urgency: 'standard', source: 'marketplace', status: 'new', opportunityId: 9,
  createdAt: new Date(), updatedAt: new Date(),
});

const authorized = (
  context: AuthContext,
  capability: ConnectAuthorizedOperation['capability'],
  operation: ConnectAuthorizedOperation['operation'],
): ConnectAuthorizedOperation => ({ capability, resource: 'enquiry', operation, context });

const service = (calls: string[]): EnquiryService => ({
  createEnquiry: async (_context, input) => { calls.push(`create:${input.businessId}`); return enquiry(8); },
  getOwnEnquiry: async (_context, id) => { calls.push(`own:${id}`); return enquiry(id); },
  getReceivedEnquiry: async (_context, id) => { calls.push(`received:${id}`); return enquiry(id); },
  getReceivedEnquiries: async (_context, businessId) => { calls.push(`list:${businessId}`); return [enquiry()]; },
  updateReceivedEnquiryStatus: async (_context, id, input) => { calls.push(`update:${id}:${input.status}`); return { ...enquiry(id), status: input.status }; },
});

test('customer enquiry read dispatches to own enquiry service', async () => {
  const calls: string[] = [];
  await dispatchConnectEnquiryCapability(authorized(customerContext, 'enquiry.read', 'read'), { capability: 'enquiry.read', enquiryId: 7 }, { enquiries: service(calls) });
  assert.deepEqual(calls, ['own:7']);
});

test('business enquiry read dispatches item or business list', async () => {
  const calls: string[] = [];
  await dispatchConnectEnquiryCapability(authorized(businessContext, 'enquiry.read', 'read'), { capability: 'enquiry.read', enquiryId: 8 }, { enquiries: service(calls) });
  await dispatchConnectEnquiryCapability(authorized(businessContext, 'enquiry.read', 'read'), { capability: 'enquiry.read', businessId: 12 }, { enquiries: service(calls) });
  assert.deepEqual(calls, ['received:8', 'list:12']);
});

test('customer enquiry create delegates canonical input', async () => {
  const calls: string[] = [];
  await dispatchConnectEnquiryCapability(
    authorized(customerContext, 'enquiry.create', 'create'),
    { capability: 'enquiry.create', input: {
      businessId: 12, customerName: 'Alice', project: 'Website', description: 'Build a website',
    } },
    { enquiries: service(calls) },
  );
  assert.deepEqual(calls, ['create:12']);
});

test('business enquiry update delegates status transition', async () => {
  const calls: string[] = [];
  await dispatchConnectEnquiryCapability(
    authorized(businessContext, 'enquiry.update', 'update'),
    { capability: 'enquiry.update', enquiryId: 8, status: 'contacted' },
    { enquiries: service(calls) },
  );
  assert.deepEqual(calls, ['update:8:contacted']);
});

test('role mismatch fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectEnquiryCapability(
      authorized(customerContext, 'enquiry.update', 'update'),
      { capability: 'enquiry.update', enquiryId: 8, status: 'contacted' },
      { enquiries: service(calls) },
    ),
    ConnectEnquiryAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('invalid identifier fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectEnquiryCapability(
      authorized(customerContext, 'enquiry.read', 'read'),
      { capability: 'enquiry.read', enquiryId: 0 },
      { enquiries: service(calls) },
    ),
    /Invalid enquiry identifier/,
  );
  assert.deepEqual(calls, []);
});

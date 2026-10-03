import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { BusinessOffering, BusinessOfferingService } from '../../resources/business-offering/contracts';
import type { ConnectAuthorizedOperation } from './authorization-binding';
import { ConnectBusinessOfferingAdapterError, dispatchConnectBusinessOfferingCapability } from './business-offering-adapter';

const businessContext: AuthContext = { userId: 84, role: 'business' };
const customerContext: AuthContext = { userId: 42, role: 'customer' };

const offering = (id = '11111111-1111-4111-8111-111111111111'): BusinessOffering => ({
  id,
  businessId: 7,
  offeringType: 'service',
  name: 'Website Development',
  slug: 'website-development',
  description: 'Business websites',
  priceAmount: '1999.00',
  currencyCode: 'ZAR',
  priceUnit: 'project',
  isActive: true,
  sortOrder: 0,
  createdBy: 84,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const authorized = (
  context: AuthContext,
  capability: ConnectAuthorizedOperation['capability'],
  operation: ConnectAuthorizedOperation['operation'],
): ConnectAuthorizedOperation => ({ capability, resource: 'business_offering', operation, context });

const service = (calls: string[]): BusinessOfferingService => ({
  listBusinessOfferings: async (_context, input) => { calls.push(`read:${input.businessId}:${input.activeOnly ?? 'all'}`); return [offering()]; },
  getBusinessOfferingBySlug: async () => offering(),
  createBusinessOffering: async (_context, input) => { calls.push(`create:${input.businessId}:${input.slug}`); return offering('22222222-2222-4222-8222-222222222222'); },
  updateBusinessOffering: async (_context, id, input) => { calls.push(`update:${id}:${input.name ?? ''}`); return offering(id); },
  listPublicBusinessOfferings: async () => [offering()],
});

test('business offering read delegates canonical list service', async () => {
  const calls: string[] = [];
  const result = await dispatchConnectBusinessOfferingCapability(
    authorized(businessContext, 'business_offering.read', 'read'),
    { capability: 'business_offering.read', businessId: 7, activeOnly: true },
    { businessOfferings: service(calls) },
  );
  assert.equal(Array.isArray(result), true);
  assert.deepEqual(calls, ['read:7:true']);
});

test('business offering create delegates canonical input', async () => {
  const calls: string[] = [];
  await dispatchConnectBusinessOfferingCapability(
    authorized(businessContext, 'business_offering.create', 'create'),
    { capability: 'business_offering.create', input: { businessId: 7, name: 'Website Development', slug: 'website-development' } },
    { businessOfferings: service(calls) },
  );
  assert.deepEqual(calls, ['create:7:website-development']);
});

test('business offering update delegates canonical input', async () => {
  const calls: string[] = [];
  await dispatchConnectBusinessOfferingCapability(
    authorized(businessContext, 'business_offering.update', 'update'),
    { capability: 'business_offering.update', offeringId: '11111111-1111-4111-8111-111111111111', input: { name: 'Updated Website Development' } },
    { businessOfferings: service(calls) },
  );
  assert.deepEqual(calls, ['update:11111111-1111-4111-8111-111111111111:Updated Website Development']);
});

test('customer business offering access fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectBusinessOfferingCapability(
      authorized(customerContext, 'business_offering.read', 'read'),
      { capability: 'business_offering.read', businessId: 7 },
      { businessOfferings: service(calls) },
    ),
    ConnectBusinessOfferingAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('invalid business offering identifiers fail before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectBusinessOfferingCapability(
      authorized(businessContext, 'business_offering.read', 'read'),
      { capability: 'business_offering.read', businessId: 0 },
      { businessOfferings: service(calls) },
    ),
    /Invalid business identifier/,
  );
  assert.deepEqual(calls, []);
});

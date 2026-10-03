import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { BusinessCapability, BusinessCapabilityService } from '../../resources/business-capability/contracts';
import type { ConnectAuthorizedOperation } from './authorization-binding';
import {
  ConnectBusinessCapabilityAdapterError,
  dispatchConnectBusinessCapability,
} from './business-capability-adapter';

const businessContext: AuthContext = { userId: 84, role: 'business' };
const customerContext: AuthContext = { userId: 42, role: 'customer' };

const capability = (id: number, businessId: number): BusinessCapability => ({
  id,
  businessId,
  capabilityId: '11111111-1111-4111-8111-111111111111',
  proficiencyLevel: 'proficient',
  description: 'Construction services',
  assertionStatus: 'active',
  assertionBasis: 'self_declared',
  verificationStatus: 'unverified',
  effectiveFrom: new Date('2026-09-16T00:00:00.000Z'),
  effectiveUntil: null,
  sourceReference: null,
  submittedAt: new Date('2026-09-16T00:00:00.000Z'),
  verifiedBy: null,
  verifiedAt: null,
  verificationReason: null,
  createdBy: 84,
  createdAt: new Date('2026-09-16T00:00:00.000Z'),
  updatedAt: new Date('2026-09-16T00:00:00.000Z'),
});

const authorized = (
  context: AuthContext,
  capabilityName: ConnectAuthorizedOperation['capability'],
  operation: ConnectAuthorizedOperation['operation'],
): ConnectAuthorizedOperation => ({
  capability: capabilityName,
  resource: 'business_capability',
  operation,
  context,
});

const service = (calls: string[]): BusinessCapabilityService => ({
  getBusinessCapability: async () => capability(1, 7),
  listBusinessCapabilities: async (_context, businessId) => {
    calls.push(`read:${businessId}`);
    return [capability(1, businessId)];
  },
  createBusinessCapability: async () => capability(1, 7),
});

test('business capability read delegates to canonical list service', async () => {
  const calls: string[] = [];
  const result = await dispatchConnectBusinessCapability(
    authorized(businessContext, 'business_capability.read', 'read'),
    { capability: 'business_capability.read', businessId: 7 },
    { businessCapabilities: service(calls) },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].businessId, 7);
  assert.deepEqual(calls, ['read:7']);
});

test('customer business capability dispatch reaches only the canonical service boundary', async () => {
  const calls: string[] = [];
  await dispatchConnectBusinessCapability(
    authorized(customerContext, 'business_capability.read', 'read'),
    { capability: 'business_capability.read', businessId: 7 },
    { businessCapabilities: service(calls) },
  );
  assert.deepEqual(calls, ['read:7']);
});

test('capability mismatch fails closed before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectBusinessCapability(
      authorized(businessContext, 'business_capability.create', 'create'),
      { capability: 'business_capability.read', businessId: 7 },
      { businessCapabilities: service(calls) },
    ),
    ConnectBusinessCapabilityAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('resource mismatch fails closed before service access', async () => {
  const calls: string[] = [];
  const invalid = {
    ...authorized(businessContext, 'business_capability.read', 'read'),
    resource: 'business_offering',
  } as unknown as ConnectAuthorizedOperation;
  await assert.rejects(
    () => dispatchConnectBusinessCapability(
      invalid,
      { capability: 'business_capability.read', businessId: 7 },
      { businessCapabilities: service(calls) },
    ),
    ConnectBusinessCapabilityAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('operation mismatch fails closed before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectBusinessCapability(
      authorized(businessContext, 'business_capability.read', 'create'),
      { capability: 'business_capability.read', businessId: 7 },
      { businessCapabilities: service(calls) },
    ),
    ConnectBusinessCapabilityAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('invalid business identifier fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectBusinessCapability(
      authorized(businessContext, 'business_capability.read', 'read'),
      { capability: 'business_capability.read', businessId: 0 },
      { businessCapabilities: service(calls) },
    ),
    /Invalid business identifier/,
  );
  assert.deepEqual(calls, []);
});

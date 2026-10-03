import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConnectAuthorizedOperation } from './authorization-binding';
import { dispatchConnectOpportunityCapability, ConnectOpportunityAdapterError } from './opportunity-adapter';
import type { OpportunityService } from '../../resources/opportunity/contracts';

const auth = (role: 'customer' | 'business' = 'customer', operation: 'read' | 'create' | 'update' | 'transition' = 'read'): ConnectAuthorizedOperation => ({
  capability: `opportunity.${operation}`,
  resource: 'opportunity',
  operation,
  context: { userId: 42, role },
});

const opportunity = {
  id: 7, opportunityTypeId: 1, creatorAccountId: 42, ownerBusinessId: null,
  countryId: null, currencyId: null, title: 'Website', description: 'Build website',
  lifecycleStatus: 'draft' as const, visibility: 'private' as const, budgetMin: null, budgetMax: null,
  opensAt: null, closesAt: null, createdAt: new Date(), updatedAt: new Date(),
};

const service = (calls: string[]): OpportunityService => ({
  createOpportunity: async (_context, input) => { calls.push(`create:${input.title}`); return opportunity; },
  getOpportunity: async (_context, id) => { calls.push(`get:${id}`); return opportunity; },
  getOwnedOpportunity: async (_context, id) => { calls.push(`owned:${id}`); return opportunity; },
  updateOwnedOpportunity: async (_context, id, input) => { calls.push(`update:${id}:${input.title ?? ''}`); return opportunity; },
  transitionOpportunity: async (_context, id, status) => { calls.push(`transition:${id}:${status}`); return { ...opportunity, lifecycleStatus: status }; },
});

test('opportunity read delegates to owned canonical service', async () => {
  const calls: string[] = [];
  const result = await dispatchConnectOpportunityCapability(auth(), { capability: 'opportunity.read', opportunityId: 7 }, { opportunities: service(calls) });
  assert.equal(result?.id, 7);
  assert.deepEqual(calls, ['owned:7']);
});

test('opportunity create delegates canonical input', async () => {
  const calls: string[] = [];
  const input = { opportunityTypeId: 1, title: 'Website', description: 'Build website' };
  await dispatchConnectOpportunityCapability(auth('customer', 'create'), { capability: 'opportunity.create', input }, { opportunities: service(calls) });
  assert.deepEqual(calls, ['create:Website']);
});

test('opportunity update delegates owned update', async () => {
  const calls: string[] = [];
  await dispatchConnectOpportunityCapability(auth('customer', 'update'), { capability: 'opportunity.update', opportunityId: 7, input: { title: 'Updated' } }, { opportunities: service(calls) });
  assert.deepEqual(calls, ['update:7:Updated']);
});

test('opportunity transition delegates lifecycle transition', async () => {
  const calls: string[] = [];
  const result = await dispatchConnectOpportunityCapability(auth('customer', 'transition'), { capability: 'opportunity.transition', opportunityId: 7, nextStatus: 'open' }, { opportunities: service(calls) });
  assert.equal(result?.lifecycleStatus, 'open');
  assert.deepEqual(calls, ['transition:7:open']);
});

test('invalid opportunity id fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectOpportunityCapability(auth(), { capability: 'opportunity.read', opportunityId: 0 }, { opportunities: service(calls) }),
    (error: unknown) => error instanceof ConnectOpportunityAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('capability mismatch fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectOpportunityCapability(auth(), { capability: 'opportunity.create', input: { opportunityTypeId: 1, title: 'x', description: 'y' } }, { opportunities: service(calls) }),
    (error: unknown) => error instanceof ConnectOpportunityAdapterError,
  );
  assert.deepEqual(calls, []);
});

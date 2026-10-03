import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConnectAuthorizedOperation } from './authorization-binding';
import {
  ConnectOpportunityParticipantAdapterError,
  dispatchConnectOpportunityParticipantCapability,
} from './opportunity-participant-adapter';
import type { OpportunityParticipantService } from '../../resources/opportunity-participant/contracts';

const auth = (operation: 'read' | 'create' | 'update' = 'read'): ConnectAuthorizedOperation => ({
  capability: `opportunity_participant.${operation}`,
  resource: 'opportunity_participant',
  operation,
  context: { userId: 42, role: 'business' },
});

const participant = {
  id: 7, opportunityId: 9, accountId: null, businessId: 42,
  participationRole: 'recipient' as const, participationStatus: 'active' as const,
  createdBy: 42, createdAt: new Date(), updatedAt: new Date(),
};

const service = (calls: string[]): OpportunityParticipantService => ({
  createParticipant: async (_context, input) => { calls.push(`create:${input.opportunityId}`); return participant; },
  getParticipant: async (_context, id) => { calls.push(`get:${id}`); return participant; },
  listOpportunityParticipants: async (_context, id) => { calls.push(`list:${id}`); return [participant]; },
  updateParticipant: async (_context, id, input) => { calls.push(`update:${id}:${input.participationStatus ?? ''}`); return participant; },
});

test('read participant delegates to canonical service', async () => {
  const calls: string[] = [];
  const result = await dispatchConnectOpportunityParticipantCapability(auth(), { capability: 'opportunity_participant.read', participantId: 7 }, { opportunityParticipants: service(calls) });
  assert.equal(result?.id, 7);
  assert.deepEqual(calls, ['get:7']);
});

test('read opportunity participants delegates to canonical list service', async () => {
  const calls: string[] = [];
  const result = await dispatchConnectOpportunityParticipantCapability(auth(), { capability: 'opportunity_participant.read', opportunityId: 9 }, { opportunityParticipants: service(calls) });
  assert.equal((result as unknown[]).length, 1);
  assert.deepEqual(calls, ['list:9']);
});

test('create delegates canonical input', async () => {
  const calls: string[] = [];
  await dispatchConnectOpportunityParticipantCapability(auth('create'), { capability: 'opportunity_participant.create', input: { opportunityId: 9, businessId: 42, participationRole: 'recipient' } }, { opportunityParticipants: service(calls) });
  assert.deepEqual(calls, ['create:9']);
});

test('update delegates canonical input', async () => {
  const calls: string[] = [];
  await dispatchConnectOpportunityParticipantCapability(auth('update'), { capability: 'opportunity_participant.update', participantId: 7, input: { participationStatus: 'completed' } }, { opportunityParticipants: service(calls) });
  assert.deepEqual(calls, ['update:7:completed']);
});

test('invalid identifier fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(() => dispatchConnectOpportunityParticipantCapability(auth(), { capability: 'opportunity_participant.read', participantId: 0 }, { opportunityParticipants: service(calls) }), (error: unknown) => error instanceof ConnectOpportunityParticipantAdapterError);
  assert.deepEqual(calls, []);
});

test('capability mismatch fails closed', async () => {
  const calls: string[] = [];
  await assert.rejects(() => dispatchConnectOpportunityParticipantCapability(auth(), { capability: 'opportunity_participant.create', input: { opportunityId: 9, participationRole: 'recipient' } }, { opportunityParticipants: service(calls) }), (error: unknown) => error instanceof ConnectOpportunityParticipantAdapterError);
  assert.deepEqual(calls, []);
});

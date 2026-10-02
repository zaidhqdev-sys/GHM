import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { SavedBusinessService } from '../../resources/saved-business/contracts';
import type { ConnectAuthorizedOperation } from './authorization-binding';
import {
  ConnectResourceCapabilityDispatchError,
  dispatchConnectResourceCapability,
} from './resource-capability-dispatch';

const context: AuthContext = { userId: 42, role: 'customer' };

const authorized = (capability: ConnectAuthorizedOperation['capability'], operation: ConnectAuthorizedOperation['operation']): ConnectAuthorizedOperation => ({
  capability,
  resource: 'saved_business',
  operation,
  context,
});

const service = (calls: string[]): SavedBusinessService => ({
  listSavedBusinesses: async () => {
    calls.push('list');
    return [];
  },
  getSavedBusiness: async (_context, id) => {
    calls.push(`get:${id}`);
    return null;
  },
  createSavedBusiness: async (_context, input) => {
    calls.push(`create:${input.businessId}`);
    return { id: 1, accountId: 42, businessId: input.businessId, createdAt: new Date('2026-10-02T00:00:00Z') };
  },
  deleteSavedBusiness: async (_context, id) => {
    calls.push(`delete:${id}`);
  },
});

test('saved-business read capability dispatches to the typed service', async () => {
  const calls: string[] = [];
  await dispatchConnectResourceCapability(
    authorized('saved_business.read', 'read'),
    { capability: 'saved_business.read', savedBusinessId: 7 },
    { savedBusinesses: service(calls) },
  );
  assert.deepEqual(calls, ['get:7']);
});

test('saved-business read without an id dispatches list', async () => {
  const calls: string[] = [];
  await dispatchConnectResourceCapability(
    authorized('saved_business.read', 'read'),
    { capability: 'saved_business.read' },
    { savedBusinesses: service(calls) },
  );
  assert.deepEqual(calls, ['list']);
});

test('saved-business create dispatches typed input to the service', async () => {
  const calls: string[] = [];
  const result = await dispatchConnectResourceCapability(
    authorized('saved_business.create', 'create'),
    { capability: 'saved_business.create', businessId: 91 },
    { savedBusinesses: service(calls) },
  );
  assert.equal((result as { businessId: number }).businessId, 91);
  assert.deepEqual(calls, ['create:91']);
});

test('saved-business delete dispatches to the typed service', async () => {
  const calls: string[] = [];
  await dispatchConnectResourceCapability(
    authorized('saved_business.delete', 'delete'),
    { capability: 'saved_business.delete', savedBusinessId: 12 },
    { savedBusinesses: service(calls) },
  );
  assert.deepEqual(calls, ['delete:12']);
});

test('capability mismatch fails closed before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectResourceCapability(
      authorized('saved_business.read', 'read'),
      { capability: 'saved_business.create', businessId: 91 },
      { savedBusinesses: service(calls) },
    ),
    (error: unknown) => error instanceof ConnectResourceCapabilityDispatchError,
  );
  assert.deepEqual(calls, []);
});

test('operation mismatch fails closed before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectResourceCapability(
      authorized('saved_business.read', 'create'),
      { capability: 'saved_business.read', savedBusinessId: 7 },
      { savedBusinesses: service(calls) },
    ),
    (error: unknown) => error instanceof ConnectResourceCapabilityDispatchError,
  );
  assert.deepEqual(calls, []);
});

test('non-saved-business authorized resource cannot reach saved-business handler', async () => {
  const calls: string[] = [];
  const invalid = { ...authorized('saved_business.read', 'read'), resource: 'quote' } as unknown as ConnectAuthorizedOperation;
  await assert.rejects(
    () => dispatchConnectResourceCapability(
      invalid,
      { capability: 'saved_business.read', savedBusinessId: 7 },
      { savedBusinesses: service(calls) },
    ),
    (error: unknown) => error instanceof ConnectResourceCapabilityDispatchError,
  );
  assert.deepEqual(calls, []);
});

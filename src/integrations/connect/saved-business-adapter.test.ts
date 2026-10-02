import assert from 'node:assert/strict';
import test from 'node:test';
import type { AccountAuthState, AccountAuthStateStore } from '../../auth/ghm-bearer';
import type { AuthContext } from '../../auth/authorization';
import type { ExternalIdentityMapping } from '../../auth/foundation/types';
import type { SavedBusiness, SavedBusinessService } from '../../resources/saved-business/contracts';
import type { ConnectIdentityAdapter } from './identity-adapter';
import { ConnectSavedBusinessAdapterImpl } from './saved-business-adapter';

const subject = '11111111-1111-4111-8111-111111111111';
const mapping: ExternalIdentityMapping = {
  id: 1,
  provider: 'supabase',
  subject,
  accountId: 42,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const state: AccountAuthState = {
  accountId: 42,
  accountStatus: 'active',
  role: 'customer',
  isSystemAdmin: false,
};

const saved: SavedBusiness = {
  id: 7,
  accountId: 42,
  businessId: 99,
  createdAt: new Date(),
};

const createAccounts = (value: AccountAuthState | null = state): AccountAuthStateStore => ({
  getAccountAuthState: async accountId => {
    assert.equal(accountId, 42);
    return value;
  },
});

const createIdentity = (resolution: Awaited<ReturnType<ConnectIdentityAdapter['resolve']>>): ConnectIdentityAdapter => ({
  resolve: async received => {
    assert.equal(received, subject);
    return resolution;
  },
});

const createService = (): SavedBusinessService & { calls: Array<[string, AuthContext, unknown]> } => {
  const calls: Array<[string, AuthContext, unknown]> = [];
  return {
    calls,
    createSavedBusiness: async (context, input) => {
      calls.push(['create', context, input]);
      return saved;
    },
    getSavedBusiness: async (context, id) => {
      calls.push(['get', context, id]);
      return id === saved.id ? saved : null;
    },
    listSavedBusinesses: async context => {
      calls.push(['list', context, null]);
      return [saved];
    },
    deleteSavedBusiness: async (context, id) => {
      calls.push(['delete', context, id]);
    },
  };
};

test('Connect Saved Business resolves external identity into DB-backed AuthContext', async () => {
  const service = createService();
  const adapter = new ConnectSavedBusinessAdapterImpl({
    identity: createIdentity({ outcome: 'resolved', mapping, created: false }),
    accounts: createAccounts(),
    savedBusinesses: service,
  });

  const result = await adapter.list(subject);
  assert.deepEqual(result, [saved]);
  assert.deepEqual(service.calls[0], ['list', { userId: 42, role: 'customer' }, null]);
});

test('Connect Saved Business does not bootstrap an unmapped identity', async () => {
  let serviceCalled = false;
  const service = createService();
  service.listSavedBusinesses = async () => {
    serviceCalled = true;
    return [];
  };
  const adapter = new ConnectSavedBusinessAdapterImpl({
    identity: createIdentity({ outcome: 'unmapped', mapping: null, created: false }),
    accounts: createAccounts(),
    savedBusinesses: service,
  });

  await assert.rejects(() => adapter.list(subject), /Connect identity is not mapped/);
  assert.equal(serviceCalled, false);
});

test('Connect Saved Business rejects disabled accounts before resource execution', async () => {
  const service = createService();
  const adapter = new ConnectSavedBusinessAdapterImpl({
    identity: createIdentity({ outcome: 'resolved', mapping, created: false }),
    accounts: createAccounts({ ...state, accountStatus: 'disabled' }),
    savedBusinesses: service,
  });

  await assert.rejects(() => adapter.get(subject, 7), /Connect identity is not active/);
  assert.equal(service.calls.length, 0);
});

test('Connect Saved Business preserves explicit resource operations and caller identity', async () => {
  const service = createService();
  const adapter = new ConnectSavedBusinessAdapterImpl({
    identity: createIdentity({ outcome: 'resolved', mapping, created: false }),
    accounts: createAccounts(),
    savedBusinesses: service,
  });

  await adapter.create(subject, 123);
  await adapter.get(subject, 7);
  await adapter.delete(subject, 7);

  assert.deepEqual(service.calls, [
    ['create', { userId: 42, role: 'customer' }, { businessId: 123 }],
    ['get', { userId: 42, role: 'customer' }, 7],
    ['delete', { userId: 42, role: 'customer' }, 7],
  ]);
});

test('Connect Saved Business does not derive authorization from external claims', async () => {
  const service = createService();
  const adapter = new ConnectSavedBusinessAdapterImpl({
    identity: createIdentity({ outcome: 'resolved', mapping: { ...mapping, accountId: 77 }, created: false }),
    accounts: {
      getAccountAuthState: async accountId => ({ ...state, accountId, role: 'business' }),
    },
    savedBusinesses: service,
  });

  await adapter.list(subject);
  assert.deepEqual(service.calls[0], ['list', { userId: 77, role: 'business' }, null]);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { SavedBusiness, SavedBusinessRepository } from './contracts';
import { SavedBusinessServiceImpl } from './service';

const customer: AuthContext = { userId: 10, role: 'customer' };

const saved: SavedBusiness = {
  id: 1,
  accountId: 10,
  businessId: 20,
  createdAt: new Date('2026-09-16T00:00:00.000Z'),
};

const repository = (overrides: Partial<SavedBusinessRepository> = {}): SavedBusinessRepository => ({
  createSavedBusiness: async () => saved,
  getSavedBusiness: async () => saved,
  listSavedBusinesses: async () => [saved],
  deleteSavedBusiness: async () => undefined,
  ...overrides,
});

test('create delegates authenticated context and validated Business ID', async () => {
  let received: unknown;
  const service = new SavedBusinessServiceImpl(repository({
    createSavedBusiness: async (context, input) => {
      received = { context, input };
      return saved;
    },
  }));

  const result = await service.createSavedBusiness(customer, { businessId: 20 });
  assert.deepEqual(received, { context: customer, input: { businessId: 20 } });
  assert.equal(result.id, 1);
});

test('create rejects invalid Business ID', async () => {
  const service = new SavedBusinessServiceImpl(repository());
  await assert.rejects(() => service.createSavedBusiness(customer, { businessId: 0 }), /businessId must be a positive integer/);
});

test('read returns only repository-owned result', async () => {
  const service = new SavedBusinessServiceImpl(repository());
  const result = await service.getSavedBusiness(customer, 1);
  assert.equal(result?.accountId, 10);
});

test('list requires an authenticated context', async () => {
  const service = new SavedBusinessServiceImpl(repository());
  await assert.rejects(() => service.listSavedBusinesses({ userId: 0, role: 'customer' }), /Authentication required/);
});

test('delete validates the Saved Business ID and delegates', async () => {
  let received: unknown;
  const service = new SavedBusinessServiceImpl(repository({
    deleteSavedBusiness: async (context, id) => { received = { context, id }; },
  }));
  await service.deleteSavedBusiness(customer, 1);
  assert.deepEqual(received, { context: customer, id: 1 });
});

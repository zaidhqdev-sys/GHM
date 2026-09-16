import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { SavedBusiness, SavedBusinessRepository } from './contracts';
import { SavedBusinessServiceImpl } from './service';

const customer: AuthContext = { userId: 7, role: 'customer' };
const savedBusiness: SavedBusiness = {
  id: 11,
  accountId: 7,
  businessId: 23,
  createdAt: new Date(0),
  business: {
    id: 23,
    name: 'Approved Business',
    slug: 'approved-business',
    verificationStatus: 'approved',
    isVerified: true,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    rating: 4.5,
    reviewCount: 12,
  },
};

const repository = (overrides: Partial<SavedBusinessRepository> = {}): SavedBusinessRepository => ({
  createSavedBusiness: async () => savedBusiness,
  getSavedBusiness: async () => savedBusiness,
  listSavedBusinesses: async () => [savedBusiness],
  deleteSavedBusiness: async () => savedBusiness,
  ...overrides,
});

test('Saved Business service binds create to businessId only', async () => {
  let received: any;
  const service = new SavedBusinessServiceImpl(repository({
    createSavedBusiness: async (_context, input) => { received = input; return savedBusiness; },
  }));
  await service.createSavedBusiness(customer, { businessId: 23 });
  assert.deepEqual(received, { businessId: 23 });
});

test('Saved Business service rejects invalid ids', async () => {
  const service = new SavedBusinessServiceImpl(repository());
  await assert.rejects(service.createSavedBusiness(customer, { businessId: 0 }), /Invalid businessId/);
  await assert.rejects(service.getSavedBusiness(customer, 0), /Invalid savedBusinessId/);
  await assert.rejects(service.deleteSavedBusiness(customer, 0), /Invalid savedBusinessId/);
});

test('Saved Business service exposes only explicit read create delete operations', async () => {
  let listed = false;
  let deleted = false;
  const service = new SavedBusinessServiceImpl(repository({
    listSavedBusinesses: async () => { listed = true; return [savedBusiness]; },
    deleteSavedBusiness: async () => { deleted = true; return savedBusiness; },
  }));
  assert.deepEqual(await service.listSavedBusinesses(customer), [savedBusiness]);
  await service.deleteSavedBusiness(customer, 11);
  assert.equal(listed, true);
  assert.equal(deleted, true);
});

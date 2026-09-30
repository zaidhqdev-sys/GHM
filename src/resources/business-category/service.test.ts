import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization.js';
import type { BusinessCategoryRepository } from './contracts.js';
import { BusinessCategoryServiceImpl } from './service.js';

const context: AuthContext = { userId: 10, role: 'business' };
const category = {
  id: '11111111-1111-4111-8111-111111111111',
  parentId: null,
  name: 'Construction',
  slug: 'construction',
  description: null,
  isActive: true,
  sortOrder: 1,
  createdAt: new Date('2026-09-30T00:00:00.000Z'),
  updatedAt: new Date('2026-09-30T00:00:00.000Z'),
};
const assignment = {
  id: 1,
  businessId: 12,
  categoryId: category.id,
  isPrimary: false,
  createdBy: 10,
  createdAt: new Date('2026-09-30T00:00:00.000Z'),
  updatedAt: new Date('2026-09-30T00:00:00.000Z'),
};

class FakeRepository implements BusinessCategoryRepository {
  async listBusinessCategories(): Promise<typeof category[]> { return [category]; }
  async getBusinessCategory(): Promise<typeof category | null> { return category; }
  async listBusinessCategoryAssignments(): Promise<typeof assignment[]> { return [assignment]; }
  async assignBusinessCategory(): Promise<typeof assignment> { return assignment; }
  async setPrimaryBusinessCategory(): Promise<typeof assignment> { return { ...assignment, isPrimary: true }; }
}

test('category service validates authentication and identifiers', async () => {
  const service = new BusinessCategoryServiceImpl(new FakeRepository());
  assert.equal((await service.listBusinessCategories(context)).length, 1);
  assert.throws(() => service.listBusinessCategories({ userId: 0, role: 'business' }, {}), /Authentication required/);
  assert.throws(() => service.getBusinessCategory(context, 'bad'), /valid UUID/);
  assert.throws(() => service.listBusinessCategoryAssignments(context, 0), /positive integer/);
});

test('assignment operations preserve authenticated context through service boundary', async () => {
  const service = new BusinessCategoryServiceImpl(new FakeRepository());
  const created = await service.assignBusinessCategory(context, { businessId: 12, categoryId: category.id });
  const primary = await service.setPrimaryBusinessCategory(context, { businessId: 12, categoryId: category.id });
  assert.equal(created.createdBy, 10);
  assert.equal(primary.isPrimary, true);
  assert.throws(() => service.assignBusinessCategory(context, { businessId: 0, categoryId: category.id }), /positive integer/);
  assert.throws(() => service.setPrimaryBusinessCategory(context, { businessId: 12, categoryId: 'bad' }), /valid UUID/);
});

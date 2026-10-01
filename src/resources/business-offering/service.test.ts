import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization.js';
import type { BusinessOfferingRepository } from './contracts.js';
import { BusinessOfferingServiceImpl } from './service.js';

const context: AuthContext = { userId: 10, role: 'business' };
const offering = {
  id: '11111111-1111-4111-8111-111111111111',
  businessId: 12,
  offeringType: 'service' as const,
  name: 'Electrical Installation',
  slug: 'electrical-installation',
  description: null,
  priceAmount: '1500.00',
  currencyCode: 'ZAR',
  priceUnit: 'project',
  isActive: true,
  sortOrder: 0,
  createdBy: 10,
  createdAt: new Date('2026-09-30T00:00:00.000Z'),
  updatedAt: new Date('2026-09-30T00:00:00.000Z'),
};

class FakeRepository implements BusinessOfferingRepository {
  async listBusinessOfferings(): Promise<typeof offering[]> { return [offering]; }
  async getBusinessOfferingBySlug(): Promise<typeof offering | null> { return offering; }
  async createBusinessOffering(): Promise<typeof offering> { return offering; }
  async updateBusinessOffering(): Promise<typeof offering> { return offering; }
  async listPublicBusinessOfferings(): Promise<typeof offering[]> { return [offering]; }
}

test('offering service validates authentication and identifiers', async () => {
  const service = new BusinessOfferingServiceImpl(new FakeRepository());
  assert.equal((await service.listBusinessOfferings(context, { businessId: 12 })).length, 1);
  assert.equal((await service.listPublicBusinessOfferings(12)).length, 1);
  assert.throws(() => service.listBusinessOfferings({ userId: 0, role: 'business' }, { businessId: 12 }), /Authentication required/);
  assert.throws(() => service.listBusinessOfferings(context, { businessId: 0 }), /positive integer/);
  assert.throws(() => service.listBusinessOfferings(context, { businessId: 12, activeOnly: 'yes' as never }), /activeOnly/);
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: 'x', slug: 'Bad Slug' }), /Slug/);
  assert.throws(() => service.getBusinessOfferingBySlug(context, 12, 'Bad Slug'), /Invalid slug/);
  assert.throws(() => service.updateBusinessOffering(context, 'bad-id', { name: 'x' }), /valid UUID/);
});

test('offering service validates bounded fields and rejects unsupported caller fields', async () => {
  const service = new BusinessOfferingServiceImpl(new FakeRepository());
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: '', slug: 'x' }), /Name/);
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: 'x', slug: 'x', offeringType: 'other' as never }), /offering type/);
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: 'x', slug: 'x', description: '   ' }), /Description/);
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: 'x', slug: 'x', priceAmount: '-1' }), /price amount/);
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: 'x', slug: 'x', priceAmount: '1.234' }), /price amount/);
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: 'x', slug: 'x', priceAmount: '999999999999.99' }), /price amount/);
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: 'x', slug: 'x', currencyCode: 'zar' }), /currency code/);
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: 'x', slug: 'x', priceUnit: '   ' }), /Price unit/);
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: 'x', slug: 'x', sortOrder: -1 }), /Sort order/);
  assert.throws(() => service.createBusinessOffering(context, { businessId: 12, name: 'x', slug: 'x', createdBy: 999 } as never), /Unsupported offering mutation/);
  assert.throws(() => service.updateBusinessOffering(context, offering.id, { businessId: 99 } as never), /Unsupported offering mutation/);
  assert.throws(() => service.updateBusinessOffering(context, offering.id, { createdBy: 999 } as never), /Unsupported offering mutation/);
  assert.throws(() => service.updateBusinessOffering(context, offering.id, {}), /update input/);
});

test('offering service accepts the documented valid boundary values', async () => {
  const service = new BusinessOfferingServiceImpl(new FakeRepository());
  await service.createBusinessOffering(context, {
    businessId: 12,
    offeringType: 'solution',
    name: ' x ',
    slug: 'x',
    description: ' description ',
    priceAmount: '0.00',
    currencyCode: 'USD',
    priceUnit: 'hour',
    sortOrder: 0,
  });
  await service.updateBusinessOffering(context, offering.id, {
    offeringType: 'product',
    name: ' y ',
    slug: 'y',
    description: null,
    priceAmount: null,
    currencyCode: 'ZAR',
    priceUnit: null,
    isActive: false,
    sortOrder: 0,
  });
});

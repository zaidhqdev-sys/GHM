import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicBusinessServiceImpl } from './public-service';
import type { PublicBusiness, PublicBusinessRepository } from './public-contracts';

const business = (id: number, visible = true): PublicBusiness => ({
  id,
  name: `Business ${id}`,
  slug: `business-${id}`,
  description: 'Public description',
  phone: '0111234567',
  email: 'business@example.com',
  province: null,
  city: null,
  physicalAddress: null,
  whatsapp: null,
  website: null,
  logoUrl: null,
  avatarLetter: null,
  avatarColor: null,
  isSupplier: null,
  yearsInBusiness: 0,
  tier: 'free',
  isFeatured: false,
  rating: 4.5,
  reviewCount: 12,
  jobsCompleted: 8,
  verificationStatus: visible ? 'approved' : 'unverified',
  isVerified: visible,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

class FakeRepository implements PublicBusinessRepository {
  businesses = new Map<number, PublicBusiness>();
  async getPublicBusiness(id: number) { const value = this.businesses.get(id); return value?.isVerified && value.verificationStatus === 'approved' ? value : null; }
  async getPublicBusinessBySlug(slug: string) { return [...this.businesses.values()].find(v => v.slug === slug && v.isVerified && v.verificationStatus === 'approved') ?? null; }
}

test('public Business read validates ids and delegates', async () => {
  const repository = new FakeRepository();
  repository.businesses.set(1, business(1));
  const service = new PublicBusinessServiceImpl(repository);
  assert.deepEqual(await service.getPublicBusiness(1), business(1));
  await assert.rejects(() => service.getPublicBusiness(0), /Invalid Business id/);
  assert.equal(await service.getPublicBusiness(2), null);
});

test('public Business slug read trims and rejects blank slugs', async () => {
  const repository = new FakeRepository();
  repository.businesses.set(1, business(1));
  const service = new PublicBusinessServiceImpl(repository);
  assert.equal((await service.getPublicBusinessBySlug('  business-1  '))?.id, 1);
  await assert.rejects(() => service.getPublicBusinessBySlug('   '), /Invalid Business slug/);
});

test('public Business projection excludes protected management fields', async () => {
  const repository = new FakeRepository();
  repository.businesses.set(1, business(1));
  const service = new PublicBusinessServiceImpl(repository);
  const result = await service.getPublicBusiness(1);
  assert.deepEqual(Object.keys(result ?? {}).sort(), [
    'createdAt',
    'description',
    'email',
    'province',
    'city',
    'physicalAddress',
    'whatsapp',
    'website',
    'logoUrl',
    'avatarLetter',
    'avatarColor',
    'isSupplier',
    'yearsInBusiness',
    'tier',
    'isFeatured',
    'id',
    'isVerified',
    'jobsCompleted',
    'name',
    'phone',
    'rating',
    'reviewCount',
    'slug',
    'updatedAt',
    'verificationStatus',
  ]);
});

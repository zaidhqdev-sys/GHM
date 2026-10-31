import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresPublicBusinessRepository } from './public-repository';
import type { TransactionPool } from '../../db/transaction';

const selectedColumns = [
  'category', 'province', 'city', 'physical_address', 'whatsapp', 'website',
  'logo_url', 'avatar_letter', 'avatar_color', 'is_supplier', 'tier',
  'is_featured', 'profile_views', 'years_in_business',
];

const makePool = (row: Record<string, unknown>) => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      return { rows: [row], rowCount: 1 };
    },
    release: () => undefined,
  };
  return { pool: { connect: async () => client } as unknown as TransactionPool, calls };
};

const publicRow = () => ({
  id: '42',
  name: 'Durban Builder',
  slug: 'durban-builder',
  description: 'Renovation',
  phone: '0311234567',
  email: 'builder@example.com',
  category: 'construction',
  province: 'KwaZulu-Natal',
  city: 'Durban',
  physical_address: '1 Example Road',
  whatsapp: '+27311234567',
  website: 'https://example.com',
  logo_url: 'https://example.com/logo.png',
  avatar_letter: 'D',
  avatar_color: '#123456',
  is_supplier: true,
  tier: 'verified' as const,
  is_featured: true,
  profile_views: '27',
  years_in_business: '8',
  rating: '4.5',
  review_count: '12',
  jobs_completed: '9',
  verification_status: 'approved' as const,
  is_verified: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-02-01T00:00:00.000Z'),
});

const assertCompleteProjection = (sql: string) => {
  for (const column of selectedColumns) {
    assert.match(sql, new RegExp('\\b' + column + '\\b'), `missing selected column: ${column}`);
  }
};

const assertMappedDetails = (business: Awaited<ReturnType<PostgresPublicBusinessRepository['getPublicBusiness']>>) => {
  assert.ok(business);
  assert.equal(business.id, 42);
  assert.equal(business.name, 'Durban Builder');
  assert.equal(business.slug, 'durban-builder');
  assert.equal(business.description, 'Renovation');
  assert.equal(business.phone, '0311234567');
  assert.equal(business.email, 'builder@example.com');
  assert.equal(business.rating, 4.5);
  assert.equal(business.reviewCount, 12);
  assert.equal(business.jobsCompleted, 9);
  assert.equal(business.createdAt.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(business.updatedAt.toISOString(), '2026-02-01T00:00:00.000Z');
  assert.equal(business.category, 'construction');
  assert.equal(business.province, 'KwaZulu-Natal');
  assert.equal(business.city, 'Durban');
  assert.equal(business.physicalAddress, '1 Example Road');
  assert.equal(business.whatsapp, '+27311234567');
  assert.equal(business.website, 'https://example.com');
  assert.equal(business.logoUrl, 'https://example.com/logo.png');
  assert.equal(business.avatarLetter, 'D');
  assert.equal(business.avatarColor, '#123456');
  assert.equal(business.isSupplier, true);
  assert.equal(business.tier, 'verified');
  assert.equal(business.isFeatured, true);
  assert.equal(business.profileViews, 27);
  assert.equal(business.yearsInBusiness, 8);
};

test('public business detail by ID selects and maps every directory field', async () => {
  const fake = makePool(publicRow());
  const repository = new PostgresPublicBusinessRepository(fake.pool);

  const business = await repository.getPublicBusiness(42);

  assertMappedDetails(business);
  assert.equal(fake.calls.length, 1);
  assertCompleteProjection(fake.calls[0].sql);
  assert.deepEqual(fake.calls[0].values, [42]);
});

test('public business detail by slug selects and maps every directory field', async () => {
  const fake = makePool(publicRow());
  const repository = new PostgresPublicBusinessRepository(fake.pool);

  const business = await repository.getPublicBusinessBySlug('durban-builder');

  assertMappedDetails(business);
  assert.equal(fake.calls.length, 1);
  assertCompleteProjection(fake.calls[0].sql);
  assert.deepEqual(fake.calls[0].values, ['durban-builder']);
});

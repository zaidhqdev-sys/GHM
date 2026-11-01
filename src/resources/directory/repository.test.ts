import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresDirectoryRepository } from './repository.js';
import type { TransactionPool } from '../../db/transaction.js';

const row = () => ({
  id: '42',
  name: 'Durban Builder',
  slug: 'durban-builder',
  description: 'Renovation',
  phone: '0311234567',
  email: 'builder@example.com',
  province: 'KwaZulu-Natal',
  city: 'Durban',
  physical_address: '1 Example Road',
  whatsapp: '+27311234567',
  website: 'https://example.com/contact',
  logo_url: null,
  avatar_letter: 'D',
  avatar_color: '#123456',
  is_supplier: true,
  years_in_business: '8',
  tier: 'verified' as const,
  is_featured: true,
  rating: '4.5',
  review_count: '12',
  jobs_completed: '9',
  verification_status: 'approved' as const,
  is_verified: true,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-02-01T00:00:00.000Z'),
});

const makePool = () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '1' }], rowCount: 1 };
      return { rows: [row()], rowCount: 1 };
    },
    release: () => undefined,
  };
  return { pool: { connect: async () => client } as unknown as TransactionPool, calls };
};

test('directory search projects all public profile fields and enforces approved visibility', async () => {
  const fake = makePool();
  const repository = new PostgresDirectoryRepository(fake.pool);
  const result = await repository.search({ page: 1, pageSize: 20 });

  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], {
    id: 42,
    name: 'Durban Builder',
    slug: 'durban-builder',
    description: 'Renovation',
    phone: '0311234567',
    email: 'builder@example.com',
    province: 'KwaZulu-Natal',
    city: 'Durban',
    physicalAddress: '1 Example Road',
    whatsapp: '+27311234567',
    website: 'https://example.com/contact',
    logoUrl: null,
    avatarLetter: 'D',
    avatarColor: '#123456',
    isSupplier: true,
    yearsInBusiness: 8,
    tier: 'verified',
    isFeatured: true,
    rating: 4.5,
    reviewCount: 12,
    jobsCompleted: 9,
    verificationStatus: 'approved',
    isVerified: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
  });
  assert.equal(fake.calls.length, 2);
  for (const call of fake.calls) {
    assert.match(call.sql, /b\.is_active = true/);
    assert.match(call.sql, /b\.is_verified = true/);
    assert.match(call.sql, /b\.verification_status = 'approved'/);
  }
  const itemQuery = fake.calls[1];
  for (const column of ['b.province', 'b.city', 'b.physical_address', 'b.whatsapp', 'b.website', 'b.logo_url', 'b.avatar_letter', 'b.avatar_color', 'b.is_supplier', 'b.years_in_business', 'b.tier', 'b.is_featured']) {
    assert.ok(itemQuery.sql.includes(column), `missing directory projection: ${column}`);
  }
  assert.deepEqual(itemQuery.values, [20, 0]);
});

test('directory search parameterizes text and normalized category assignment filters', async () => {
  const fake = makePool();
  const repository = new PostgresDirectoryRepository(fake.pool);
  await repository.search({ q: '100%_safe', category: 'construction', page: 2, pageSize: 10 });

  const [countQuery, itemQuery] = fake.calls;
  assert.match(countQuery.sql, /b\.name ILIKE/);
  assert.match(countQuery.sql, /ESCAPE/);
  assert.match(countQuery.sql, /FROM ghm\.business_category_assignment bca/);
  assert.match(countQuery.sql, /JOIN ghm\.business_category bc/);
  assert.match(countQuery.sql, /bc\.is_active = true/);
  assert.match(countQuery.sql, /bc\.id::text = \$2 OR bc\.slug = \$2/);
  assert.deepEqual(countQuery.values, ['100\\%\\_safe', 'construction']);
  assert.deepEqual(itemQuery.values, ['100\\%\\_safe', 'construction', 10, 10]);
  assert.match(itemQuery.sql, /LIMIT \$3\s+OFFSET \$4/);
});

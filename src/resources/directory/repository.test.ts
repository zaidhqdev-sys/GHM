import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresDirectoryRepository } from './repository';
import type { TransactionPool } from '../../db/transaction';

const makePool = (rows: unknown[][]) => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  let index = 0;
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      const current = rows[index++] ?? [];
      return { rows: current, rowCount: current.length };
    },
    release: () => undefined,
  };
  return { pool: { connect: async () => client } as unknown as TransactionPool, calls };
};

test('directory repository binds query, category, province, city, and supplier filters without SQL interpolation', async () => {
  const fake = makePool([[{ count: '1' }], [{
    id: '42',
    name: 'Durban Builder',
    slug: 'durban-builder',
    description: 'Renovation',
    phone: null,
    email: null,
    category: 'construction',
    province: 'KwaZulu-Natal',
    city: 'Durban',
    physical_address: null,
    whatsapp: null,
    website: null,
    logo_url: null,
    avatar_letter: 'D',
    avatar_color: '#123456',
    is_supplier: false,
    tier: 'free',
    is_featured: false,
    profile_views: '9',
    years_in_business: 12,
    rating: '4.5',
    review_count: '3',
    jobs_completed: '7',
    verification_status: 'approved',
    is_verified: true,
    created_at: new Date(0),
    updated_at: new Date(0),
  }]]);
  const result = await new PostgresDirectoryRepository(fake.pool).search({
    q: 'builder',
    category: 'construction',
    province: 'KwaZulu-Natal',
    city: 'Durban',
    businessType: 'contractors',
    page: 2,
    pageSize: 10,
  });

  assert.equal(fake.calls.length, 2);
  assert.match(fake.calls[0].sql, /b\.category = \$2/);
  assert.match(fake.calls[0].sql, /bc\.id::text = \$2 OR bc\.slug = \$2/);
  assert.match(fake.calls[0].sql, /lower\(b\.province\) = lower\(\$3\)/);
  assert.match(fake.calls[0].sql, /lower\(b\.city\) = lower\(\$4\)/);
  assert.match(fake.calls[0].sql, /b\.is_supplier = \$5/);
  assert.deepEqual(fake.calls[0].values, ['builder', 'construction', 'KwaZulu-Natal', 'Durban', false]);
  assert.deepEqual(fake.calls[1].values, ['builder', 'construction', 'KwaZulu-Natal', 'Durban', false, 10, 10]);
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, 42);
  assert.equal(result.items[0].province, 'KwaZulu-Natal');
  assert.equal(result.items[0].isSupplier, false);
  assert.equal(result.items[0].profileViews, 9);
  assert.equal(result.items[0].yearsInBusiness, 12);
});

test('directory repository omits optional filters and maps canonical numeric identifiers', async () => {
  const fake = makePool([[{ count: '1' }], [{
    id: '7',
    name: 'Approved Business',
    slug: 'approved-business',
    description: null,
    phone: null,
    email: null,
    category: null,
    province: null,
    city: null,
    physical_address: null,
    whatsapp: null,
    website: null,
    logo_url: null,
    avatar_letter: null,
    avatar_color: null,
    is_supplier: true,
    tier: 'free',
    is_featured: false,
    profile_views: '0',
    years_in_business: 0,
    rating: '0',
    review_count: '0',
    jobs_completed: '0',
    verification_status: 'approved',
    is_verified: true,
    created_at: new Date(0),
    updated_at: new Date(0),
  }]]);
  const result = await new PostgresDirectoryRepository(fake.pool).search({
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(fake.calls[0].values, []);
  assert.deepEqual(fake.calls[1].values, [20, 0]);
  assert.equal(result.items[0].id, 7);
  assert.equal(result.items[0].isSupplier, true);
});


test('public categories query includes only active categories assigned to publicly visible businesses', async () => {
  const fake = makePool([[{ id: 'cat-1', slug: 'construction', name: 'Construction' }]]);
  const repository = new PostgresDirectoryRepository(fake.pool);
  assert.deepEqual(await repository.listPublicCategories(), [{ id: 'cat-1', slug: 'construction', name: 'Construction' }]);
  assert.match(fake.calls[0].sql, /bc\.is_active = true/);
  assert.match(fake.calls[0].sql, /b\.verification_status = 'approved'/);
  assert.match(fake.calls[0].sql, /b\.is_verified = true/);
});

import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import '../scripts/test-env.cjs';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { PostgresDirectoryRepository } = await import('../dist/resources/directory/repository.js');
const { DirectoryServiceImpl } = await import('../dist/resources/directory/service.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-directory-${randomUUID()}`;
const fixture = { accounts: [], businesses: [], categories: [] };

const identity = async (pool, expected, label) => {
  const { rows } = await pool.query('SELECT current_database() AS database_name, session_user, current_user, current_role');
  const row = rows[0];
  if (row.database_name !== 'ghm_db' || row.session_user !== expected || row.current_user !== expected || row.current_role !== expected) {
    throw new Error(`${label}: ${JSON.stringify(row)}`);
  }
  console.log(`${label}: ${row.database_name}/${row.current_user}`);
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const createFixture = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');

    const account = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role)
       VALUES ($1, 'business') RETURNING id`,
      [`${marker} owner`],
    );
    const ownerId = Number(account.rows[0].id);
    fixture.accounts.push(ownerId);

    const businesses = [];
    for (const [name, slug, status, verified, active, rating, reviewCount] of [
      [`${marker} High`, `${marker}-high`, 'approved', true, true, 5, 20],
      [`${marker} Low`, `${marker}-low`, 'approved', true, true, 3, 2],
      [`${marker} Inactive`, `${marker}-inactive`, 'approved', true, false, 5, 50],
      [`${marker} Unverified`, `${marker}-unverified`, 'unverified', false, true, 5, 50],
    ]) {
      const result = await client.query(
        `INSERT INTO ghm.business
           (name, slug, verification_status, is_verified, is_active, rating, review_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [name, slug, status, verified, active, rating, reviewCount],
      );
      const id = Number(result.rows[0].id);
      fixture.businesses.push(id);
      businesses.push(id);
    }

    await client.query(
      `INSERT INTO ghm.business_membership
         (business_id, account_id, membership_role, membership_status, created_by)
       VALUES ($1, $2, 'owner', 'active', $2),
              ($3, $2, 'owner', 'active', $2),
              ($4, $2, 'owner', 'active', $2),
              ($5, $2, 'owner', 'active', $2)`,
      [businesses[0], ownerId, businesses[1], businesses[2], businesses[3]],
    );

    const categories = [];
    for (const suffix of ['a', 'b']) {
      const id = randomUUID();
      categories.push(id);
      fixture.categories.push(id);
      await client.query(
        `INSERT INTO ghm.business_category (id, name, slug, is_active, sort_order)
         VALUES ($1, $2, $3, true, $4)`,
        [id, `${marker} Category ${suffix.toUpperCase()}`, `${marker}-category-${suffix}`, categories.length],
      );
    }

    await client.query(
      `INSERT INTO ghm.business_category_assignment (business_id, category_id, created_by)
       VALUES ($1, $3, $2), ($4, $5, $2)`,
      [businesses[0], ownerId, categories[0], businesses[1], categories[1]],
    );

    await client.query('COMMIT');
    return {
      ownerId,
      high: businesses[0],
      low: businesses[1],
      inactive: businesses[2],
      unverified: businesses[3],
      categoryA: categories[0],
      categoryB: categories[1],
      categoryASlug: `${marker}-category-a`,
      categoryBSlug: `${marker}-category-b`,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

try {
  await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'RUNTIME IDENTITY PASS'),
    identity(cleanupPool, 'ghm_migrator', 'CLEANUP AUTHORITY PASS'),
  ]);

  const f = await createFixture();
  const service = new DirectoryServiceImpl(new PostgresDirectoryRepository(runtimePool));
  const fixtureQuery = { q: marker, page: 1, pageSize: 20 };

  const visible = await service.search(fixtureQuery);
  assert(visible.total === 2, `Expected exactly two public fixture businesses, got ${visible.total}`);
  assert(visible.items.length === 2, `Expected two public fixture rows, got ${visible.items.length}`);
  assert(visible.items[0].id === f.high, 'Stable rating ordering did not place the high-rated fixture first');
  assert(!visible.items.some(item => item.id === f.inactive || item.id === f.unverified), 'Visibility predicate leaked inactive/unverified business');
  console.log('PUBLIC VISIBILITY + RATING ORDER PASS');

  const categoryUuid = await service.search({ q: marker, category: f.categoryA, page: 1, pageSize: 20 });
  assert(categoryUuid.total === 1 && categoryUuid.items[0]?.id === f.high, 'Category UUID filter failed');
  console.log('CATEGORY UUID FILTER PASS');

  const categorySlug = await service.search({ q: marker, category: f.categoryBSlug, page: 1, pageSize: 20 });
  assert(categorySlug.total === 1 && categorySlug.items[0]?.id === f.low, 'Category slug filter failed');
  console.log('CATEGORY SLUG FILTER PASS');

  const text = await service.search({ q: `${marker} Low`, page: 1, pageSize: 20 });
  assert(text.total === 1 && text.items[0]?.id === f.low, 'Text search filter failed');
  console.log('TEXT SEARCH FILTER PASS');

  const escaped = await service.search({ q: `${marker}%`, page: 1, pageSize: 20 });
  assert(escaped.total === 0, 'Escaped wildcard query unexpectedly matched fixture businesses');
  console.log('TEXT WILDCARD ESCAPING PASS');

  const pageOne = await service.search({ q: marker, page: 1, pageSize: 1 });
  const pageTwo = await service.search({ q: marker, page: 2, pageSize: 1 });
  assert(pageOne.total === 2 && pageTwo.total === 2, 'Pagination total is inconsistent');
  assert(pageOne.items.length === 1 && pageTwo.items.length === 1, 'Pagination page size is inconsistent');
  assert(pageOne.items[0]?.id === f.high && pageTwo.items[0]?.id === f.low, 'Pagination ordering is not stable');
  console.log('PAGINATION + STABLE ORDER PASS');

  const projectionKeys = Object.keys(visible.items[0] ?? {}).sort();
  assert(
    projectionKeys.join(',') === [
      'createdAt', 'description', 'email', 'id', 'isVerified', 'jobsCompleted',
      'name', 'phone', 'rating', 'reviewCount', 'slug', 'updatedAt', 'verificationStatus',
    ].sort().join(','),
    `Unexpected public projection keys: ${projectionKeys.join(',')}`,
  );
  console.log('PUBLIC PROJECTION ALLOWLIST PASS');

  const privileges = (await runtimePool.query(
    `SELECT has_table_privilege(current_user, 'ghm.business', 'SELECT') AS business_select,
            has_table_privilege(current_user, 'ghm.business', 'INSERT') AS business_insert,
            has_table_privilege(current_user, 'ghm.business', 'UPDATE') AS business_update,
            has_table_privilege(current_user, 'ghm.business_category_assignment', 'SELECT') AS assignment_select,
            has_table_privilege(current_user, 'ghm.business_category', 'SELECT') AS category_select`,
  )).rows[0];
  assert(privileges.business_select && privileges.assignment_select && privileges.category_select, `Required directory SELECT privileges missing: ${JSON.stringify(privileges)}`);
  console.log('RUNTIME DIRECTORY DEPENDENCY PRIVILEGE PASS');

  console.log('GHM PUBLIC DIRECTORY RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    await cleanupPool.query('BEGIN');
    await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');
    if (fixture.businesses.length) {
      await cleanupPool.query('DELETE FROM ghm.business WHERE id = ANY($1::bigint[])', [fixture.businesses]);
    }
    if (fixture.categories.length) {
      await cleanupPool.query('DELETE FROM ghm.business_category WHERE id = ANY($1::uuid[])', [fixture.categories]);
    }
    if (fixture.accounts.length) {
      await cleanupPool.query('DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])', [fixture.accounts]);
    }
    await cleanupPool.query('COMMIT');
  } catch (error) {
    await cleanupPool.query('ROLLBACK').catch(() => {});
    console.error(`Qualification cleanup failed: ${error?.message ?? error}`);
  }
  await runtimePool.end();
  await cleanupPool.end();
}

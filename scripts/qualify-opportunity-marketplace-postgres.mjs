import assert from 'node:assert/strict';
import pg from 'pg';
import { PostgresOpportunityRepository } from '../dist/resources/opportunity/repository.js';

const { Pool } = pg;
const connectionString = process.env.GHM_RUNTIME_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('GHM runtime database URL is required for Opportunity marketplace qualification.');

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

try {
  const identity = await pool.query(
    "SELECT id FROM ghm.account_identity WHERE full_name = 'CI Storage Qualification Member' ORDER BY id DESC LIMIT 1",
  );
  assert.equal(identity.rowCount, 1, 'CI runtime account fixture must exist');
  const context = { userId: Number(identity.rows[0].id), role: 'business' };
  const repository = new PostgresOpportunityRepository({
    async connect() { return pool.connect(); },
  });

  const page = await repository.listMarketplaceOpportunities(context, {
    search: 'ci-opportunity-marketplace-no-match',
    opportunityTypeId: 1,
    limit: 10,
    offset: 0,
  });
  assert.deepEqual(page.opportunities, []);
  assert.equal(page.limit, 10);
  assert.equal(page.offset, 0);
  assert.equal(typeof page.total, 'number');

  const types = await repository.listOpportunityTypes(context);
  assert.ok(Array.isArray(types));
  for (const item of types) {
    assert.equal(typeof item.id, 'number');
    assert.equal(typeof item.code, 'string');
    assert.equal(typeof item.name, 'string');
  }

  console.log('OPPORTUNITY MARKETPLACE COLLECTION SQL PASS');
  console.log('OPPORTUNITY TYPE CATALOGUE SQL PASS');
} finally {
  await pool.end();
}

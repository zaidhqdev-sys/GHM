/**
 * Live PostgreSQL qualification for the Connect Business provisioning/linking boundary.
 *
 * Requires distinct GHM_RUNTIME_DATABASE_URL and GHM_MIGRATOR_DATABASE_URL.
 * Uses the real runtime path for adapter operations and schema-owner access only
 * for isolated fixture setup/verification/cleanup.
 *
 * This is construction qualification only. It does not perform Connect cutover,
 * shadow writes, backfill, or production routing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';
import { ConnectBusinessAdapter } from './business-adapter';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

const ssl = process.env.DATABASE_SSL === 'true'
  ? { rejectUnauthorized: false }
  : undefined;

const schemaReady = async (): Promise<boolean> => {
  if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl) return false;
  const pool = new Pool({ connectionString: migratorUrl, ssl });
  const client = await pool.connect();
  try {
    await client.query('SET ROLE ghm_schema_owner');
    const result = await client.query<{ ready: boolean }>(`
      SELECT
        to_regclass('ghm.business') IS NOT NULL
        AND to_regclass('ghm.business_membership') IS NOT NULL
        AND to_regclass('ghm.business_external_mapping') IS NOT NULL
        AND to_regprocedure('ghm.auth_link_business_external_mapping(text,text,bigint)') IS NOT NULL
        AS ready
    `);
    return Boolean(result.rows[0]?.ready);
  } catch {
    return false;
  } finally {
    client.release();
    await pool.end();
  }
};

const count = async (client: PoolClient, sql: string, values: unknown[] = []): Promise<number> => {
  const result = await client.query<{ n: number }>(sql, values);
  return Number(result.rows[0]?.n ?? 0);
};

test('Connect Business provisioning/linking: live PostgreSQL concurrency and rollback qualification', async (t) => {
  if (!(await schemaReady())) {
    t.skip('Distinct runtime/migrator URLs or Business mapping schema/functions unavailable');
    return;
  }

  const runtimePool = new Pool({ connectionString: runtimeUrl!, ssl, max: 10 });
  const migratorPool = new Pool({ connectionString: migratorUrl!, ssl, max: 10 });

  const marker = `ghm-connect-business-live-${randomUUID()}`;
  const slugA = `live-${marker}-a`;
  const slugB = `live-${marker}-b`;
  const accountAContext = { userId: 0, role: 'business' } as AuthContext;
  const accountBContext = { userId: 0, role: 'business' } as AuthContext;

  let accountA = 0;
  let accountB = 0;
  let preservedBusinessA = 0;
  let preservedBusinessB = 0;

  const ownerClient = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      return await work(client);
    } finally {
      client.release();
    }
  };

  t.after(async () => {
    await ownerClient(async (client) => {
      await client.query(
        'DELETE FROM ghm.business_external_mapping WHERE provider = $1 AND external_business_id LIKE $2',
        ['supabase', `${marker}%`],
      );
      await client.query(
        'DELETE FROM ghm.business_membership WHERE account_id IN ($1, $2)',
        [accountA, accountB],
      );
      await client.query(
        'DELETE FROM ghm.business WHERE name LIKE $1 OR slug IN ($2, $3)',
        [`${marker}%`, slugA, slugB],
      );
      await client.query(
        'DELETE FROM ghm.account_identity WHERE id IN ($1, $2)',
        [accountA, accountB],
      );
    });
    await runtimePool.end();
    await migratorPool.end();
  });

  await t.test('fixture creates two independent business accounts with preserved memberships', async () => {
    await ownerClient(async (client) => {
      const a = await client.query(
        `INSERT INTO ghm.account_identity (full_name, role, account_status, is_system_admin)
         VALUES ($1, 'business', 'active', false) RETURNING id`,
        [`${marker}-account-a`],
      );
      const b = await client.query(
        `INSERT INTO ghm.account_identity (full_name, role, account_status, is_system_admin)
         VALUES ($1, 'business', 'active', false) RETURNING id`,
        [`${marker}-account-b`],
      );
      accountA = Number(a.rows[0].id);
      accountB = Number(b.rows[0].id);
      accountAContext.userId = accountA;
      accountBContext.userId = accountB;

      const ba = await client.query(
        `INSERT INTO ghm.business (name, slug, verification_status, is_active)
         VALUES ($1, $2, 'unverified', true) RETURNING id`,
        [`${marker}-preserved-a`, slugA],
      );
      const bb = await client.query(
        `INSERT INTO ghm.business (name, slug, verification_status, is_active)
         VALUES ($1, $2, 'unverified', true) RETURNING id`,
        [`${marker}-preserved-b`, slugB],
      );
      preservedBusinessA = Number(ba.rows[0].id);
      preservedBusinessB = Number(bb.rows[0].id);

      await client.query(
        `INSERT INTO ghm.business_membership
          (business_id, account_id, membership_role, membership_status, created_by)
         VALUES ($1, $2, 'owner', 'active', $2), ($3, $4, 'owner', 'active', $4)`,
        [preservedBusinessA, accountA, preservedBusinessB, accountB],
      );
    });
    assert.ok(accountA > 0);
    assert.ok(accountB > 0);
  });

  const externalBusinessId = randomUUID();

  await t.test('two different accounts concurrently provision the same external Business UUID', async () => {
    const adapterA = new ConnectBusinessAdapter({ connect: () => runtimePool.connect() });
    const adapterB = new ConnectBusinessAdapter({ connect: () => runtimePool.connect() });

    const results = await Promise.all([
      adapterA.provisionOrResolve(accountAContext, {
        externalBusinessId,
        name: `${marker}-canonical`,
      }),
      adapterB.provisionOrResolve(accountBContext, {
        externalBusinessId,
        name: `${marker}-canonical`,
      }),
    ]);

    assert.equal(results.length, 2);
    assert.deepEqual(
      new Set(results.map((result) => result.business.id)).size,
      1,
      'both requests must converge on one canonical GHM Business',
    );

    const canonicalId = results[0].business.id;
    assert.ok(results.every((result) => result.mapping.businessId === canonicalId));
    assert.equal(results.filter((result) => result.outcome === 'provisioned').length, 1);
    assert.equal(results.filter((result) => result.outcome === 'resolved').length, 1);

    const state = await ownerClient(async (client) => ({
      businesses: await count(
        client,
        'SELECT count(*)::int AS n FROM ghm.business WHERE name = $1',
        [`${marker}-canonical`],
      ),
      mappings: await count(
        client,
        'SELECT count(*)::int AS n FROM ghm.business_external_mapping WHERE provider = $1 AND external_business_id = $2',
        ['supabase', externalBusinessId],
      ),
      owners: await count(
        client,
        `SELECT count(*)::int AS n FROM ghm.business_membership
          WHERE business_id = $1 AND membership_role = 'owner' AND membership_status = 'active'`,
        [canonicalId],
      ),
      preservedA: await count(
        client,
        `SELECT count(*)::int AS n FROM ghm.business_membership
          WHERE business_id = $1 AND account_id = $2 AND membership_role = 'owner' AND membership_status = 'active'`,
        [preservedBusinessA, accountA],
      ),
      preservedB: await count(
        client,
        `SELECT count(*)::int AS n FROM ghm.business_membership
          WHERE business_id = $1 AND account_id = $2 AND membership_role = 'owner' AND membership_status = 'active'`,
        [preservedBusinessB, accountB],
      ),
    }));

    assert.equal(state.businesses, 1);
    assert.equal(state.mappings, 1);
    assert.equal(state.owners, 1);
    assert.equal(state.preservedA, 1);
    assert.equal(state.preservedB, 1);
  });

  await t.test('retry by the original account is idempotent and creates no second Business', async () => {
    const adapter = new ConnectBusinessAdapter({ connect: () => runtimePool.connect() });
    const first = await adapter.provisionOrResolve(accountAContext, {
      externalBusinessId,
      name: `${marker}-different-name-that-must-be-ignored`,
    });
    const second = await adapter.provisionOrResolve(accountAContext, {
      externalBusinessId,
      name: `${marker}-different-name-that-must-be-ignored-again`,
    });

    assert.equal(first.outcome, 'resolved');
    assert.equal(second.outcome, 'resolved');
    assert.equal(first.business.id, second.business.id);

    const totals = await ownerClient(async (client) => ({
      mappings: await count(
        client,
        'SELECT count(*)::int AS n FROM ghm.business_external_mapping WHERE provider = $1 AND external_business_id = $2',
        ['supabase', externalBusinessId],
      ),
      named: await count(
        client,
        'SELECT count(*)::int AS n FROM ghm.business WHERE name LIKE $1',
        [`${marker}-different-name%`],
      ),
    }));
    assert.equal(totals.mappings, 1);
    assert.equal(totals.named, 0);
  });

  await t.test('pre-existing mapping conflict is deterministic and leaves mapping unchanged', async () => {
    const conflictExternalId = randomUUID();
    let otherBusiness = 0;

    await ownerClient(async (client) => {
      const inserted = await client.query(
        `INSERT INTO ghm.business (name, slug, verification_status, is_active)
         VALUES ($1, $2, 'unverified', true) RETURNING id`,
        [`${marker}-conflict-target`, `${marker}-conflict-target`],
      );
      otherBusiness = Number(inserted.rows[0].id);
      await client.query(
        `INSERT INTO ghm.business_external_mapping (provider, external_business_id, business_id)
         VALUES ('supabase', $1, $2)`,
        [conflictExternalId, otherBusiness],
      );
    });

    const adapter = new ConnectBusinessAdapter({ connect: () => runtimePool.connect() });
    const before = await ownerClient(async (client) =>
      client.query(
        'SELECT business_id FROM ghm.business_external_mapping WHERE provider = $1 AND external_business_id = $2',
        ['supabase', conflictExternalId],
      ),
    );

    await assert.rejects(
      () => adapter.provisionOrResolve(accountAContext, {
        externalBusinessId: conflictExternalId,
        name: `${marker}-must-not-create`,
      }),
      /Connect Business mapping conflict/,
    );

    const after = await ownerClient(async (client) => ({
      mapping: await client.query(
        'SELECT business_id FROM ghm.business_external_mapping WHERE provider = $1 AND external_business_id = $2',
        ['supabase', conflictExternalId],
      ),
      created: await count(
        client,
        'SELECT count(*)::int AS n FROM ghm.business WHERE name = $1',
        [`${marker}-must-not-create`],
      ),
    }));

    assert.equal(Number(before.rows[0].business_id), otherBusiness);
    assert.equal(Number(after.mapping.rows[0].business_id), otherBusiness);
    assert.equal(after.created, 0);
  });

  await t.test('forced link failure rolls back the Business and owner membership atomically', async () => {
    const rollbackExternalId = randomUUID();
    const rollbackName = `${marker}-rollback`;

    class LinkFailingPool implements TransactionPool {
      constructor(private readonly delegate: Pool) {}
      async connect(): Promise<PoolClient> {
        const client = await this.delegate.connect();
        const originalQuery = client.query.bind(client);
        client.query = (async (textOrConfig: any, values?: any) => {
          const sql = typeof textOrConfig === 'string'
            ? textOrConfig
            : String(textOrConfig?.text ?? '');
          if (sql.includes('auth_link_business_external_mapping')) {
            throw new Error('QUALIFICATION_FORCED_LINK_FAILURE');
          }
          return values === undefined
            ? originalQuery(textOrConfig)
            : originalQuery(textOrConfig, values);
        }) as PoolClient['query'];
        return client;
      }
    }

    const adapter = new ConnectBusinessAdapter(new LinkFailingPool(runtimePool));

    await assert.rejects(
      () => adapter.provisionOrResolve(accountAContext, {
        externalBusinessId: rollbackExternalId,
        name: rollbackName,
      }),
      /QUALIFICATION_FORCED_LINK_FAILURE/,
    );

    const leftovers = await ownerClient(async (client) => ({
      businesses: await count(
        client,
        'SELECT count(*)::int AS n FROM ghm.business WHERE name = $1',
        [rollbackName],
      ),
      memberships: await count(
        client,
        `SELECT count(*)::int AS n FROM ghm.business_membership bm
          JOIN ghm.business b ON b.id = bm.business_id
         WHERE b.name = $1`,
        [rollbackName],
      ),
      mappings: await count(
        client,
        'SELECT count(*)::int AS n FROM ghm.business_external_mapping WHERE provider = $1 AND external_business_id = $2',
        ['supabase', rollbackExternalId],
      ),
    }));

    assert.equal(leftovers.businesses, 0);
    assert.equal(leftovers.memberships, 0);
    assert.equal(leftovers.mappings, 0);
  });
});

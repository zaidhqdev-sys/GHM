/**
 * Live PostgreSQL qualification for signed Connect Business provisioning.
 *
 * Requires distinct GHM_ACTOR_GATEWAY_DATABASE_URL, GHM_RUNTIME_DATABASE_URL
 * and GHM_MIGRATOR_DATABASE_URL plus the disposable assertion secret.
 * Gateway operations use the dedicated Actor Gateway login; fixture setup,
 * verification and cleanup use the controlled migrator/schema-owner path.
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
import { PostgresConnectBusinessProvisioningReader } from '../../actor-gateway/connect-business-provisioning-reader';

const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const assertionSecret = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;

const ssl = process.env.DATABASE_SSL === 'true'
  ? { rejectUnauthorized: false }
  : undefined;

const schemaReady = async (): Promise<boolean> => {
  if (
    !gatewayUrl || !runtimeUrl || !migratorUrl || !assertionSecret ||
    new Set([gatewayUrl, runtimeUrl, migratorUrl]).size !== 3
  ) return false;
  const pool = new Pool({ connectionString: migratorUrl, ssl });
  const client = await pool.connect();
  try {
    await client.query('SET ROLE ghm_schema_owner');
    const result = await client.query<{ ready: boolean }>(`
      SELECT
        to_regclass('ghm.business') IS NOT NULL
        AND to_regclass('ghm.business_membership') IS NOT NULL
        AND to_regclass('ghm.business_external_mapping') IS NOT NULL
        AND to_regclass('ghm.actor_gateway_capability_assertion_secret') IS NOT NULL
        AND to_regprocedure('ghm.gateway_provision_connect_business(bigint,bigint,uuid,text,text,text,text,text)') IS NOT NULL
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

const expectSqlState = async (work: () => Promise<unknown>, code: string): Promise<void> => {
  await assert.rejects(work, (error: unknown) =>
    Boolean(error && typeof error === 'object' && 'code' in error && error.code === code),
  );
};

test('Connect Business provisioning: signed gateway atomicity, membership and isolation qualification', async (t) => {
  if (!(await schemaReady())) {
    t.skip('Distinct gateway/runtime/migrator URLs, assertion secret or signed provisioning schema unavailable');
    return;
  }

  const gatewayPool = new Pool({ connectionString: gatewayUrl!, ssl, max: 10 });
  const runtimePool = new Pool({ connectionString: runtimeUrl!, ssl, max: 10 });
  const migratorPool = new Pool({ connectionString: migratorUrl!, ssl, max: 10 });
  const reader = new PostgresConnectBusinessProvisioningReader(gatewayPool, assertionSecret!);

  const marker = `ghm-connect-business-live-${randomUUID()}`;
  const accountNameA = `${marker}-account-a`;
  const accountNameB = `${marker}-account-b`;
  let accountA = 0;
  let accountB = 0;
  const externalBusinessIds: string[] = [];
  const createdSlugs: string[] = [];

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
      await client.query('DROP TRIGGER IF EXISTS qualification_reject_connect_mapping ON ghm.business_external_mapping');
      await client.query('DROP FUNCTION IF EXISTS ghm.qualification_reject_connect_mapping()');
      if (externalBusinessIds.length > 0) {
        await client.query(
          'DELETE FROM ghm.business_external_mapping WHERE provider = $1 AND external_business_id = ANY($2::text[])',
          ['supabase', externalBusinessIds],
        );
      }
      await client.query(
        'DELETE FROM ghm.business_membership WHERE account_id IN ($1, $2)',
        [accountA, accountB],
      );
      if (createdSlugs.length > 0) {
        await client.query('DELETE FROM ghm.business WHERE slug = ANY($1::text[])', [createdSlugs]);
      }
      await client.query(
        'DELETE FROM ghm.business WHERE name LIKE $1',
        [`${marker}%`],
      );
      await client.query(
        'DELETE FROM ghm.account_identity WHERE id IN ($1, $2)',
        [accountA, accountB],
      );
    });
    await gatewayPool.end();
    await runtimePool.end();
    await migratorPool.end();
  });

  await ownerClient(async (client) => {
    await client.query(
      `INSERT INTO ghm.actor_gateway_capability_assertion_secret(singleton, secret)
       VALUES (true, decode($1, 'base64'))
       ON CONFLICT (singleton) DO UPDATE SET secret = EXCLUDED.secret`,
      [assertionSecret],
    );
    const a = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role, account_status, is_system_admin)
       VALUES ($1, 'business', 'active', false) RETURNING id`,
      [accountNameA],
    );
    const b = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role, account_status, is_system_admin)
       VALUES ($1, 'business', 'active', false) RETURNING id`,
      [accountNameB],
    );
    accountA = Number(a.rows[0].id);
    accountB = Number(b.rows[0].id);
  });

  await t.test('runtime cannot call the mapping helper or read mapping rows directly', async () => {
    await expectSqlState(
      () => runtimePool.query(
        'SELECT * FROM ghm.auth_link_business_external_mapping($1, $2, $3)',
        ['supabase', randomUUID(), 1],
      ),
      '42501',
    );
    await expectSqlState(
      () => runtimePool.query('SELECT id FROM ghm.business_external_mapping LIMIT 1'),
      '42501',
    );
  });

  const externalBusinessId = randomUUID();
  externalBusinessIds.push(externalBusinessId);

  await t.test('concurrent accounts cannot resolve another account’s newly provisioned Business', async () => {
    const results = await Promise.allSettled([
      reader.provisionOrResolve(accountA, { externalBusinessId, name: `${marker}-canonical` }),
      reader.provisionOrResolve(accountB, { externalBusinessId, name: `${marker}-canonical` }),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const denial = (rejected[0] as PromiseRejectedResult).reason as { code?: string };
    assert.equal(denial.code, '42501');

    const winner = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof reader.provisionOrResolve>>>).value;
    const winnerId = Number((results[0].status === 'fulfilled' ? accountA : accountB));
    const loserId = winnerId === accountA ? accountB : accountA;
    createdSlugs.push(winner.business.slug);
    assert.equal(winner.outcome, 'provisioned');
    assert.equal(winner.mapping.businessId, winner.business.id);

    const state = await ownerClient(async (client) => ({
      businesses: await count(client, 'SELECT count(*)::int AS n FROM ghm.business WHERE slug = $1', [winner.business.slug]),
      mappings: await count(client, 'SELECT count(*)::int AS n FROM ghm.business_external_mapping WHERE provider = $1 AND external_business_id = $2', ['supabase', externalBusinessId]),
      owners: await count(client, `SELECT count(*)::int AS n FROM ghm.business_membership WHERE business_id = $1 AND account_id = $2 AND membership_role = 'owner' AND membership_status = 'active'`, [winner.business.id, winnerId]),
      loserMemberships: await count(client, 'SELECT count(*)::int AS n FROM ghm.business_membership WHERE business_id = $1 AND account_id = $2 AND membership_status = \'active\'', [winner.business.id, loserId]),
    }));
    assert.deepEqual(state, { businesses: 1, mappings: 1, owners: 1, loserMemberships: 0 });

    const retry = await reader.provisionOrResolve(winnerId, {
      externalBusinessId,
      name: 'different-name-ignored',
    });
    assert.equal(retry.outcome, 'resolved');
    assert.equal(retry.business.id, winner.business.id);
  });

  await t.test('pre-existing mapping resolves only for an active member and never relinks', async () => {
    const mappedExternalId = randomUUID();
    externalBusinessIds.push(mappedExternalId);
    let mappedBusiness = 0;
    const mappedSlug = `${marker}-preexisting`;
    createdSlugs.push(mappedSlug);

    await ownerClient(async (client) => {
      const inserted = await client.query(
        `INSERT INTO ghm.business (name, slug, verification_status, is_active)
         VALUES ($1, $2, 'unverified', true) RETURNING id`,
        [`${marker}-preexisting-target`, mappedSlug],
      );
      mappedBusiness = Number(inserted.rows[0].id);
      await client.query(
        `INSERT INTO ghm.business_membership
          (business_id, account_id, membership_role, membership_status, created_by)
         VALUES ($1, $2, 'owner', 'active', $2)`,
        [mappedBusiness, accountA],
      );
      await client.query(
        `INSERT INTO ghm.business_external_mapping (provider, external_business_id, business_id)
         VALUES ('supabase', $1, $2)`,
        [mappedExternalId, mappedBusiness],
      );
    });

    const resolved = await reader.provisionOrResolve(accountA, {
      externalBusinessId: mappedExternalId,
      name: `${marker}-ignored`,
    });
    assert.equal(resolved.outcome, 'resolved');
    assert.equal(resolved.business.id, mappedBusiness);

    await expectSqlState(
      () => reader.provisionOrResolve(accountB, {
        externalBusinessId: mappedExternalId,
        name: `${marker}-not-a-member`,
      }),
      '42501',
    );

    const after = await ownerClient(async (client) => client.query(
      'SELECT business_id FROM ghm.business_external_mapping WHERE provider = $1 AND external_business_id = $2',
      ['supabase', mappedExternalId],
    ));
    assert.equal(Number(after.rows[0].business_id), mappedBusiness);
  });

  await t.test('mapping insert failure rolls back Business and owner membership atomically', async () => {
    const rollbackExternalId = randomUUID();
    externalBusinessIds.push(rollbackExternalId);
    const rollbackName = `${marker}-rollback`;
    const rollbackSlug = `${marker}-rollback`;
    createdSlugs.push(rollbackSlug);

    await ownerClient(async (client) => {
      await client.query(`
        DROP TRIGGER IF EXISTS qualification_reject_connect_mapping ON ghm.business_external_mapping;
        DROP FUNCTION IF EXISTS ghm.qualification_reject_connect_mapping();
        CREATE OR REPLACE FUNCTION ghm.qualification_reject_connect_mapping()
        RETURNS trigger
        LANGUAGE plpgsql
        SET search_path = pg_catalog, ghm
        AS $$
        BEGIN
          RAISE EXCEPTION 'qualification forced mapping failure' USING ERRCODE = '23514';
        END;
        $$;
        CREATE TRIGGER qualification_reject_connect_mapping
          BEFORE INSERT ON ghm.business_external_mapping
          FOR EACH ROW EXECUTE FUNCTION ghm.qualification_reject_connect_mapping();
      `);
    });

    try {
      await assert.rejects(
        () => reader.provisionOrResolve(accountA, { externalBusinessId: rollbackExternalId, name: rollbackName }),
        (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23514'),
      );
    } finally {
      await ownerClient(async (client) => {
        await client.query('DROP TRIGGER IF EXISTS qualification_reject_connect_mapping ON ghm.business_external_mapping');
        await client.query('DROP FUNCTION IF EXISTS ghm.qualification_reject_connect_mapping()');
      });
    }

    const leftovers = await ownerClient(async (client) => ({
      businesses: await count(client, 'SELECT count(*)::int AS n FROM ghm.business WHERE slug = $1', [rollbackSlug]),
      memberships: await count(client, `SELECT count(*)::int AS n FROM ghm.business_membership bm JOIN ghm.business b ON b.id = bm.business_id WHERE b.slug = $1`, [rollbackSlug]),
      mappings: await count(client, 'SELECT count(*)::int AS n FROM ghm.business_external_mapping WHERE provider = $1 AND external_business_id = $2', ['supabase', rollbackExternalId]),
    }));
    assert.deepEqual(leftovers, { businesses: 0, memberships: 0, mappings: 0 });
  });
});

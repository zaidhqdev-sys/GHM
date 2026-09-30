/**
 * Database-backed Auth foundation tests.
 * Requires GHM_RUNTIME_DATABASE_URL (or DATABASE_URL) and GHM_MIGRATOR_DATABASE_URL
 * after auth DDL + runtime function migrations have been applied.
 *
 * Skips cleanly when URLs are unavailable or auth schema is not yet migrated.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

process.env.CORS_ORIGINS ??= 'http://localhost';
process.env.JWT_SECRET ??= 'test-jwt-secret-for-auth-foundation-qualification';
process.env.INVITE_CODE ??= 'test-invite-code';
process.env.GHM_AUTH_TOKEN_PEPPER ??= randomBytes(32).toString('base64url');

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

const probeAuthSchemaReady = async (): Promise<boolean> => {
  if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl) return false;
  const pool = new Pool({
    connectionString: migratorUrl,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  const client = await pool.connect();
  try {
    await client.query('SET ROLE ghm_schema_owner');
    const result = await client.query<{ ready: boolean }>(`
      SELECT
        to_regclass('ghm.authentication_session') IS NOT NULL
        AND to_regprocedure('ghm.auth_rotate_refresh(bytea,bytea)') IS NOT NULL
        AND to_regprocedure('ghm.auth_link_external_identity(text,text,bigint)') IS NOT NULL
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

test('auth foundation persistence (database)', async (t) => {
  const dbAvailable = await probeAuthSchemaReady();
  if (!dbAvailable) {
    t.skip('Auth schema/functions not migrated or GHM_MIGRATOR_DATABASE_URL / runtime URL unavailable');
    return;
  }

  const { PostgresAuthPersistence, AuthPersistenceError } = await import('./persistence');
  const { decodeOpaqueTokenWire } = await import('./opaque-token');

  const runtimePool = new Pool({
    connectionString: runtimeUrl!,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  const migratorPool = new Pool({
    connectionString: migratorUrl!,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  const marker = `ghm-auth-foundation-${randomUUID()}`;
  let accountId = 0;
  const persistence = new PostgresAuthPersistence(runtimePool);

  t.after(async () => {
    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      await client.query(`DELETE FROM ghm.business_external_mapping WHERE provider LIKE $1`, [
        `test-biz-%${marker.slice(-12)}%`,
      ]);
      await client.query(`DELETE FROM ghm.business WHERE slug LIKE $1`, [`biz-${marker}%`]);
      await client.query(`DELETE FROM ghm.business WHERE name LIKE $1`, [`${marker}%`]);
      if (accountId > 0) {
        await client.query('DELETE FROM ghm.account_identity WHERE id = $1', [accountId]);
      }
      await client.query(`DELETE FROM ghm.account_identity WHERE full_name = $1`, [marker]);
      await client.query(`DELETE FROM ghm.account_identity WHERE full_name LIKE $1`, [`${marker}%`]);
    } finally {
      client.release();
      await runtimePool.end();
      await migratorPool.end();
    }
  });

  await t.test('setup fixture account via migrator', async () => {
    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      const inserted = await client.query(
        `INSERT INTO ghm.account_identity (full_name, role, account_status, is_system_admin)
         VALUES ($1, 'customer', 'active', false)
         RETURNING id`,
        [marker],
      );
      accountId = Number(inserted.rows[0].id);
      assert.ok(accountId > 0);
    } finally {
      client.release();
    }
  });

  await t.test('runtime cannot UPDATE account_status directly', async () => {
    await assert.rejects(
      () =>
        runtimePool.query(
          `UPDATE ghm.account_identity SET account_status = 'disabled' WHERE id = $1`,
          [accountId],
        ),
      /permission denied|must be owner/i,
    );
  });

  await t.test('runtime cannot SELECT password or refresh hash tables', async () => {
    await assert.rejects(
      () => runtimePool.query('SELECT password_hash FROM ghm.account_password_credential LIMIT 1'),
      /permission denied/i,
    );
    await assert.rejects(
      () => runtimePool.query('SELECT token_hash FROM ghm.refresh_credential LIMIT 1'),
      /permission denied/i,
    );
  });

  await t.test('create session, rotate, replay, and concurrent rotate', async () => {
    const created = await persistence.createSessionWithRefresh(accountId);
    assert.ok(created.session.id > 0);
    assert.equal(created.session.accountId, accountId);
    assert.equal('raw' in created, false);
    assert.equal(decodeOpaqueTokenWire(created.refreshTokenWire).length, 32);

    const usable = await persistence.validateSession(created.session.id);
    assert.equal(usable.isUsable, true);

    const rotated = await persistence.rotateRefresh(created.refreshTokenWire);
    assert.equal(rotated.session.id, created.session.id);
    assert.notEqual(rotated.refreshTokenWire, created.refreshTokenWire);

    await assert.rejects(
      () => persistence.rotateRefresh(created.refreshTokenWire),
      (error: unknown) =>
        error instanceof AuthPersistenceError && error.code === 'REFRESH_CREDENTIAL_REUSED',
    );

    const afterReplay = await persistence.validateSession(created.session.id);
    assert.equal(afterReplay.isUsable, false);
    assert.equal(afterReplay.rejectReason, 'session_revoked');

    const again = await persistence.createSessionWithRefresh(accountId);
    const results = await Promise.allSettled([
      persistence.rotateRefresh(again.refreshTokenWire),
      persistence.rotateRefresh(again.refreshTokenWire),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  });

  await t.test('session inactivity and absolute expiry enforcement', async () => {
    const created = await persistence.createSessionWithRefresh(accountId);
    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      await client.query(
        `UPDATE ghm.authentication_session
            SET last_seen_at = now() - interval '31 days'
          WHERE id = $1`,
        [created.session.id],
      );
    } finally {
      client.release();
    }
    const inactive = await persistence.validateSession(created.session.id);
    assert.equal(inactive.isUsable, false);
    assert.equal(inactive.rejectReason, 'inactivity_expired');

    const created2 = await persistence.createSessionWithRefresh(accountId);
    const client2 = await migratorPool.connect();
    try {
      await client2.query('SET ROLE ghm_schema_owner');
      await client2.query(
        `UPDATE ghm.authentication_session
            SET created_at = now() - interval '91 days',
                last_seen_at = now() - interval '1 day',
                absolute_expires_at = now() - interval '1 minute'
          WHERE id = $1`,
        [created2.session.id],
      );
    } finally {
      client2.release();
    }
    const absolute = await persistence.validateSession(created2.session.id);
    assert.equal(absolute.isUsable, false);
    assert.equal(absolute.rejectReason, 'absolute_expired');
  });

  await t.test('disable account rejects further sessions and revokes existing', async () => {
    const created = await persistence.createSessionWithRefresh(accountId);
    await persistence.disableAccount(accountId);
    const validation = await persistence.validateSession(created.session.id);
    assert.equal(validation.isUsable, false);
    assert.ok(
      validation.rejectReason === 'account_disabled' || validation.rejectReason === 'session_revoked',
    );
    await assert.rejects(() => persistence.createSessionWithRefresh(accountId), AuthPersistenceError);

    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      await client.query(
        `UPDATE ghm.account_identity SET account_status = 'active', updated_at = now() WHERE id = $1`,
        [accountId],
      );
    } finally {
      client.release();
    }
  });

  await t.test('recovery redemption is single-use and revokes all sessions', async () => {
    const s1 = await persistence.createSessionWithRefresh(accountId);
    const s2 = await persistence.createSessionWithRefresh(accountId);
    const issued = await persistence.issueRecovery(accountId, 30);
    assert.ok(issued.recoveryTokenWire.length > 0);

    const redeemedAccount = await persistence.redeemRecovery(issued.recoveryTokenWire);
    assert.equal(redeemedAccount, accountId);

    await assert.rejects(
      () => persistence.redeemRecovery(issued.recoveryTokenWire),
      (error: unknown) =>
        error instanceof AuthPersistenceError && error.code === 'RECOVERY_CREDENTIAL_INVALID',
    );

    const v1 = await persistence.validateSession(s1.session.id);
    const v2 = await persistence.validateSession(s2.session.id);
    assert.equal(v1.isUsable, false);
    assert.equal(v2.isUsable, false);

    const again = await persistence.issueRecovery(accountId, 30);
    const concurrent = await Promise.allSettled([
      persistence.redeemRecovery(again.recoveryTokenWire),
      persistence.redeemRecovery(again.recoveryTokenWire),
    ]);
    assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter((r) => r.status === 'rejected').length, 1);
  });

  await t.test('expired recovery fails', async () => {
    const issued = await persistence.issueRecovery(accountId, 30);
    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      await client.query(
        `UPDATE ghm.password_recovery_credential
            SET created_at = now() - interval '2 hours',
                expires_at = now() - interval '1 minute'
          WHERE id = $1`,
        [issued.credentialId],
      );
    } finally {
      client.release();
    }
    await assert.rejects(() => persistence.redeemRecovery(issued.recoveryTokenWire), AuthPersistenceError);
  });

  await t.test('external identity lookup/bootstrap is idempotent and non-admin', async () => {
    const provider = `test-provider-${marker}`;
    const subject = `subject-${marker}`;
    const first = await persistence.bootstrapExternalIdentity(provider, subject, marker, 'customer');
    assert.equal(first.created, true);
    assert.ok(first.accountId > 0);
    const second = await persistence.bootstrapExternalIdentity(provider, subject, marker, 'customer');
    assert.equal(second.created, false);
    assert.equal(second.accountId, first.accountId);
    const looked = await persistence.lookupExternalIdentity(provider, subject);
    assert.equal(looked?.accountId, first.accountId);

    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      const admin = await client.query(
        `SELECT is_system_admin FROM ghm.account_identity WHERE id = $1`,
        [first.accountId],
      );
      assert.equal(admin.rows[0].is_system_admin, false);
      const membership = await client.query(
        `SELECT 1 FROM ghm.business_membership WHERE account_id = $1`,
        [first.accountId],
      );
      assert.equal(membership.rowCount, 0);
    } finally {
      client.release();
    }
  });

  await t.test('link external identity: create, idempotent, conflict, missing account', async () => {
    const { EXTERNAL_IDENTITY_PROVIDER_SUPABASE } = await import('./types');
    const provider = EXTERNAL_IDENTITY_PROVIDER_SUPABASE;
    const subjectA = `link-a-${marker}`;
    const subjectB = `link-b-${marker}`;

    const created = await persistence.linkExternalIdentity(provider, subjectA, accountId);
    assert.equal(created.outcome, 'created');
    assert.equal(created.mapping?.accountId, accountId);
    assert.equal(created.mapping?.provider, provider);
    assert.equal(created.mapping?.subject, subjectA);

    const again = await persistence.linkExternalIdentity(provider, subjectA, accountId);
    assert.equal(again.outcome, 'already_linked');
    assert.equal(again.mapping?.id, created.mapping?.id);
    assert.equal(again.mapping?.accountId, accountId);

    const client = await migratorPool.connect();
    let otherAccountId = 0;
    try {
      await client.query('SET ROLE ghm_schema_owner');
      const inserted = await client.query(
        `INSERT INTO ghm.account_identity (full_name, role, account_status, is_system_admin)
         VALUES ($1, 'customer', 'active', false)
         RETURNING id`,
        [`${marker}-other`],
      );
      otherAccountId = Number(inserted.rows[0].id);

      const count = await client.query(
        `SELECT count(*)::int AS n FROM ghm.account_external_identity
          WHERE provider = $1 AND subject = $2`,
        [provider, subjectA],
      );
      assert.equal(count.rows[0].n, 1);
    } finally {
      client.release();
    }

    const conflict = await persistence.linkExternalIdentity(provider, subjectA, otherAccountId);
    assert.equal(conflict.outcome, 'conflict');
    assert.equal(conflict.mapping?.accountId, accountId);
    assert.notEqual(conflict.mapping?.accountId, otherAccountId);

    const missing = await persistence.linkExternalIdentity(provider, `missing-${marker}`, 9_007_199_254_740_991);
    assert.equal(missing.outcome, 'account_not_found');
    assert.equal(missing.mapping, null);

    // Cross-product: two distinct supabase subjects → same GHM account (explicit link only)
    const secondSubject = await persistence.linkExternalIdentity(provider, subjectB, accountId);
    assert.equal(secondSubject.outcome, 'created');
    assert.equal(secondSubject.mapping?.accountId, accountId);

    const lookedA = await persistence.lookupExternalIdentity(provider, subjectA);
    const lookedB = await persistence.lookupExternalIdentity(provider, subjectB);
    assert.equal(lookedA?.accountId, accountId);
    assert.equal(lookedB?.accountId, accountId);
    assert.notEqual(subjectA, subjectB);
  });

  await t.test('link external identity: disabled account may be linked without re-enable', async () => {
    const { EXTERNAL_IDENTITY_PROVIDER_SUPABASE } = await import('./types');
    const provider = EXTERNAL_IDENTITY_PROVIDER_SUPABASE;
    const subject = `disabled-${marker}`;
    let disabledId = 0;

    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      const inserted = await client.query(
        `INSERT INTO ghm.account_identity (full_name, role, account_status, is_system_admin)
         VALUES ($1, 'customer', 'disabled', false)
         RETURNING id`,
        [`${marker}-disabled`],
      );
      disabledId = Number(inserted.rows[0].id);
    } finally {
      client.release();
    }

    const linked = await persistence.linkExternalIdentity(provider, subject, disabledId);
    assert.equal(linked.outcome, 'created');
    assert.equal(linked.mapping?.accountId, disabledId);

    const verify = await migratorPool.connect();
    try {
      await verify.query('SET ROLE ghm_schema_owner');
      const status = await verify.query(
        `SELECT account_status, is_system_admin FROM ghm.account_identity WHERE id = $1`,
        [disabledId],
      );
      assert.equal(status.rows[0].account_status, 'disabled');
      assert.equal(status.rows[0].is_system_admin, false);
    } finally {
      verify.release();
    }
  });

  await t.test('link external identity: runtime cannot INSERT table; can EXECUTE function', async () => {
    const { EXTERNAL_IDENTITY_PROVIDER_SUPABASE } = await import('./types');
    const provider = EXTERNAL_IDENTITY_PROVIDER_SUPABASE;
    const subject = `acl-${marker}`;

    const runtimeClient = await runtimePool.connect();
    try {
      await assert.rejects(
        () =>
          runtimeClient.query(
            `INSERT INTO ghm.account_external_identity (provider, subject, account_id)
             VALUES ($1, $2, $3)`,
            [provider, subject, accountId],
          ),
        (error: unknown) => {
          const err = error as { code?: string; message?: string };
          return err.code === '42501' || Boolean(err.message?.match(/permission denied/i));
        },
      );
    } finally {
      runtimeClient.release();
    }

    const viaFunction = await persistence.linkExternalIdentity(provider, subject, accountId);
    assert.equal(viaFunction.outcome, 'created');

    const owner = await migratorPool.connect();
    try {
      await owner.query('SET ROLE ghm_schema_owner');
      const meta = await owner.query<{ owner: string }>(`
        SELECT pg_get_userbyid(p.proowner) AS owner
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'ghm'
           AND p.proname = 'auth_link_external_identity'
      `);
      assert.equal(meta.rows[0]?.owner, 'ghm_schema_owner');
      const security = await owner.query<{ prosecdef: boolean }>(`
        SELECT p.prosecdef
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'ghm'
           AND p.proname = 'auth_link_external_identity'
      `);
      assert.equal(security.rows[0]?.prosecdef, true);
    } finally {
      owner.release();
    }
  });

  await t.test('link business external mapping: create, idempotent, conflict, missing, ACL', async () => {
    const provider = `test-biz-${marker.slice(-12)}`;
    const externalId = `ext-${marker}`;
    let businessId = 0;
    let otherBusinessId = 0;

    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      const b1 = await client.query(
        `INSERT INTO ghm.business (name, slug, verification_status, is_active)
         VALUES ($1, $2, 'unverified', true)
         RETURNING id, verification_status, is_active`,
        [`${marker}-biz-a`, `biz-${marker}-a`],
      );
      businessId = Number(b1.rows[0].id);
      assert.equal(b1.rows[0].verification_status, 'unverified');
      assert.equal(b1.rows[0].is_active, true);

      const b2 = await client.query(
        `INSERT INTO ghm.business (name, slug, verification_status, is_active)
         VALUES ($1, $2, 'unverified', true)
         RETURNING id`,
        [`${marker}-biz-b`, `biz-${marker}-b`],
      );
      otherBusinessId = Number(b2.rows[0].id);
    } finally {
      client.release();
    }

    const created = await persistence.linkBusinessExternalMapping(provider, externalId, businessId);
    assert.equal(created.outcome, 'created');
    assert.equal(created.mapping?.businessId, businessId);
    assert.equal(created.mapping?.provider, provider);
    assert.equal(created.mapping?.externalBusinessId, externalId);

    const again = await persistence.linkBusinessExternalMapping(provider, externalId, businessId);
    assert.equal(again.outcome, 'already_linked');
    assert.equal(again.mapping?.id, created.mapping?.id);

    const conflict = await persistence.linkBusinessExternalMapping(provider, externalId, otherBusinessId);
    assert.equal(conflict.outcome, 'conflict');
    assert.equal(conflict.mapping?.businessId, businessId);

    const missing = await persistence.linkBusinessExternalMapping(
      provider,
      `missing-${marker}`,
      9_007_199_254_740_991,
    );
    assert.equal(missing.outcome, 'business_not_found');
    assert.equal(missing.mapping, null);

    await assert.rejects(
      () => persistence.linkBusinessExternalMapping('  ', externalId, businessId),
      AuthPersistenceError,
    );
    await assert.rejects(
      () => persistence.linkBusinessExternalMapping(provider, '  ', businessId),
      AuthPersistenceError,
    );

    // Concurrent same-key same business → deterministic created/already_linked; one row
    const raceExternal = `race-${marker}`;
    const raced = await Promise.all([
      persistence.linkBusinessExternalMapping(provider, raceExternal, businessId),
      persistence.linkBusinessExternalMapping(provider, raceExternal, businessId),
    ]);
    for (const result of raced) {
      assert.ok(result.outcome === 'created' || result.outcome === 'already_linked');
      assert.equal(result.mapping?.businessId, businessId);
    }
    assert.equal(raced.filter((r) => r.outcome === 'created').length >= 1, true);

    const verify = await migratorPool.connect();
    try {
      await verify.query('SET ROLE ghm_schema_owner');
      const count = await verify.query(
        `SELECT count(*)::int AS n FROM ghm.business_external_mapping
          WHERE provider = $1 AND external_business_id = $2`,
        [provider, raceExternal],
      );
      assert.equal(count.rows[0].n, 1);

      const membership = await verify.query(
        `SELECT 1 FROM ghm.business_membership WHERE business_id = $1`,
        [businessId],
      );
      assert.equal(membership.rowCount, 0);

      const businessState = await verify.query(
        `SELECT verification_status, is_active FROM ghm.business WHERE id = $1`,
        [businessId],
      );
      assert.equal(businessState.rows[0].verification_status, 'unverified');
      assert.equal(businessState.rows[0].is_active, true);

      const meta = await verify.query<{ owner: string; prosecdef: boolean; search_path: string | null }>(`
        SELECT pg_get_userbyid(p.proowner) AS owner,
               p.prosecdef,
               (SELECT option_value FROM pg_options_to_table(p.proconfig)
                 WHERE option_name = 'search_path' LIMIT 1) AS search_path
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'ghm'
           AND p.proname = 'auth_link_business_external_mapping'
      `);
      assert.equal(meta.rows[0]?.owner, 'ghm_schema_owner');
      assert.equal(meta.rows[0]?.prosecdef, true);
      assert.match(String(meta.rows[0]?.search_path ?? ''), /pg_catalog,\s*ghm/);
    } finally {
      verify.release();
    }

    const runtimeClient = await runtimePool.connect();
    try {
      await assert.rejects(
        () =>
          runtimeClient.query(
            `INSERT INTO ghm.business_external_mapping (provider, external_business_id, business_id)
             VALUES ($1, $2, $3)`,
            [provider, `direct-${marker}`, businessId],
          ),
        (error: unknown) => {
          const err = error as { code?: string; message?: string };
          return err.code === '42501' || Boolean(err.message?.match(/permission denied/i));
        },
      );
    } finally {
      runtimeClient.release();
    }
  });

  await t.test('password set via DEFINER', async () => {
    await persistence.setPassword(accountId, `user+${marker}@Example.COM`, 'CorrectHorseBattery1');
    const looked = await persistence.lookupPasswordByEmail(`user+${marker}@example.com`);
    assert.ok(looked);
    assert.equal(looked!.accountId, accountId);
    assert.match(looked!.passwordHash, /^\$argon2id\$/);
  });
});

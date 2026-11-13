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
        AND to_regprocedure('ghm.auth_create_account(text,text,text,text,text,integer,integer,integer)') IS NOT NULL
        AND to_regprocedure('ghm.auth_link_external_identity(text,text,bigint)') IS NOT NULL
        AND to_regprocedure('ghm.auth_link_business_external_mapping(text,text,bigint)') IS NOT NULL
        AND to_regprocedure('ghm.auth_redeem_recovery_with_count(bytea)') IS NOT NULL
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

  const setPasswordAsOwner = async (targetAccountId: number, email: string, password: string): Promise<void> => {
    const { createArgon2idPasswordHasher } = await import('./password');
    const hashed = await createArgon2idPasswordHasher().hash(password);
    const normalizedEmail = email.trim().toLowerCase();
    const client = await migratorPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      await client.query(
        `SELECT ghm.auth_set_password($1, $2, $3, $4, $5, $6, $7)`,
        [
          targetAccountId,
          email,
          normalizedEmail,
          hashed.passwordHash,
          hashed.argon2MemoryKib,
          hashed.argon2TimeCost,
          hashed.argon2Parallelism,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const redeemRecoveryAsOwner = async (recoveryTokenWire: string): Promise<number> => {
    const { decodeOpaqueTokenWire } = await import('./opaque-token');
    const { protectOpaqueToken } = await import('./token-hmac');
    const raw = decodeOpaqueTokenWire(recoveryTokenWire);
    const tokenHash = protectOpaqueToken(Buffer.from(process.env.GHM_AUTH_TOKEN_PEPPER!, 'utf8'), 'recovery', raw);
    const client = await migratorPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      const result = await client.query(
        'SELECT ghm.auth_redeem_recovery($1) AS account_id',
        [tokenHash],
      );
      await client.query('COMMIT');
      return Number(result.rows[0].account_id);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const validateSessionAsOwner = async (sessionId: number) => {
    const client = await migratorPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      const result = await client.query(
        'SELECT * FROM ghm.auth_validate_session($1)',
        [sessionId],
      );
      await client.query('COMMIT');
      if (result.rowCount !== 1) throw new Error('Session validation fixture returned no row');
      const row = result.rows[0];
      return {
        isUsable: Boolean(row.is_usable),
        rejectReason: row.reject_reason ?? null,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const linkExternalIdentityAsOwner = async (provider: string, subject: string, targetAccountId: number) => {
    const client = await migratorPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      const result = await client.query(
        'SELECT * FROM ghm.auth_link_external_identity($1, $2, $3)',
        [provider, subject, targetAccountId],
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

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

  await t.test('create canonical account is atomic and duplicate email is rejected', async () => {
    const registrationEmail = `registration-${marker}@example.com`;
    const created = await persistence.createAccount!('QuoteFlow Registration', 'customer', registrationEmail, 'CorrectHorse1');
    assert.ok(created.accountId > 0);
    assert.equal(created.loginEmail, registrationEmail);
    const credential = await persistence.lookupPasswordByEmail(registrationEmail);
    assert.equal(credential?.accountId, created.accountId);
    assert.equal(credential?.accountStatus, 'active');

    await assert.rejects(
      () => persistence.createAccount!('Duplicate', 'customer', registrationEmail, 'CorrectHorse1'),
      AuthPersistenceError,
    );

    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      const membership = await client.query(
        'SELECT 1 FROM ghm.business_membership WHERE account_id = $1',
        [created.accountId],
      );
      assert.equal(membership.rowCount, 0);
      await client.query('DELETE FROM ghm.account_identity WHERE id = $1', [created.accountId]);
    } finally {
      client.release();
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

    const usable = await validateSessionAsOwner(created.session.id);
    assert.equal(usable.isUsable, true);

    const rotated = await persistence.rotateRefresh(created.refreshTokenWire);
    assert.equal(rotated.session.id, created.session.id);
    assert.notEqual(rotated.refreshTokenWire, created.refreshTokenWire);

    await assert.rejects(
      () => persistence.rotateRefresh(created.refreshTokenWire),
      (error: unknown) =>
        error instanceof AuthPersistenceError && error.code === 'REFRESH_CREDENTIAL_REUSED',
    );

    const afterReplay = await validateSessionAsOwner(created.session.id);
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
    const inactive = await validateSessionAsOwner(created.session.id);
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
    const absolute = await validateSessionAsOwner(created2.session.id);
    assert.equal(absolute.isUsable, false);
    assert.equal(absolute.rejectReason, 'absolute_expired');
  });

  await t.test('unused account/session administration RPCs are not executable by runtime', async () => {
    const runtimeClient = await runtimePool.connect();
    try {
      const privileges = await runtimeClient.query(`
        SELECT
          has_function_privilege(current_user, 'ghm.auth_revoke_session(bigint,text)', 'EXECUTE') AS can_revoke_session,
          has_function_privilege(current_user, 'ghm.auth_change_password(bigint,bigint,text,text,text,integer,integer,integer)', 'EXECUTE') AS can_change_password,
          has_function_privilege(current_user, 'ghm.auth_disable_account(bigint)', 'EXECUTE') AS can_disable_account,
          has_function_privilege(current_user, 'ghm.auth_revoke_all_sessions_for_account(bigint,text)', 'EXECUTE') AS can_revoke_all_sessions
      `);
      assert.deepEqual(privileges.rows[0], {
        can_revoke_session: false,
        can_change_password: false,
        can_disable_account: false,
        can_revoke_all_sessions: false,
      });

      const denied = (error: unknown) => {
        const err = error as { code?: string; message?: string };
        return err.code === '42501' || Boolean(err.message?.match(/permission denied/i));
      };
      await assert.rejects(
        () => runtimeClient.query('SELECT ghm.auth_revoke_session($1,$2)', [1, 'logout']),
        denied,
      );
      await assert.rejects(
        () => runtimeClient.query(
          'SELECT ghm.auth_change_password($1,$2,$3,$4,$5,$6,$7,$8)',
          [1, 1, 'user@example.test', 'user@example.test', 'not-a-real-hash', null, null, null],
        ),
        denied,
      );
      await assert.rejects(
        () => runtimeClient.query('SELECT ghm.auth_disable_account($1)', [1]),
        denied,
      );
      await assert.rejects(
        () => runtimeClient.query('SELECT ghm.auth_revoke_all_sessions_for_account($1,$2)', [1, 'password_recovery']),
        denied,
      );
    } finally {
      runtimeClient.release();
    }
  });

  await t.test('recovery redemption is single-use and revokes all sessions', async () => {
    const s1 = await persistence.createSessionWithRefresh(accountId);
    const s2 = await persistence.createSessionWithRefresh(accountId);
    const issued = await persistence.issueRecovery(accountId, 30);
    assert.ok(issued.recoveryTokenWire.length > 0);

    const redeemedAccount = await redeemRecoveryAsOwner(issued.recoveryTokenWire);
    assert.equal(redeemedAccount, accountId);

    await assert.rejects(
      () => redeemRecoveryAsOwner(issued.recoveryTokenWire),
      (error: unknown) => (error as { code?: string }).code === 'P0001',
    );

    const v1 = await validateSessionAsOwner(s1.session.id);
    const v2 = await validateSessionAsOwner(s2.session.id);
    assert.equal(v1.isUsable, false);
    assert.equal(v2.isUsable, false);

    const again = await persistence.issueRecovery(accountId, 30);
    const concurrent = await Promise.allSettled([
      redeemRecoveryAsOwner(again.recoveryTokenWire),
      redeemRecoveryAsOwner(again.recoveryTokenWire),
    ]);
    assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter((r) => r.status === 'rejected').length, 1);
  });


  await t.test('password recovery returns the session-family revocation count without a direct account-ID RPC', async () => {
    const s1 = await persistence.createSessionWithRefresh(accountId);
    const s2 = await persistence.createSessionWithRefresh(accountId);
    const issued = await persistence.issueRecovery(accountId, 30);
    const email = `recovery-reset-${accountId}@example.test`;
    await setPasswordAsOwner(accountId, email, 'Initial-Recovery-Password-123!');

    await assert.rejects(
      () => persistence.resetPasswordWithRecovery(
        issued.recoveryTokenWire,
        `mismatch+${email}`,
        'New-Password-For-Recovery-123!',
      ),
      (error: unknown) =>
        error instanceof AuthPersistenceError && error.code === 'RECOVERY_CREDENTIAL_INVALID',
    );

    const reset = await persistence.resetPasswordWithRecovery(
      issued.recoveryTokenWire,
      email,
      'New-Password-For-Recovery-123!',
    );
    assert.ok(reset.revokedSessionCount >= 2);
    assert.equal(await persistence.lookupPasswordByEmail(email).then((credential) => credential?.loginEmail), email);

    const v1 = await validateSessionAsOwner(s1.session.id);
    const v2 = await validateSessionAsOwner(s2.session.id);
    assert.equal(v1.isUsable, false);
    assert.equal(v2.isUsable, false);

    await assert.rejects(
      () => persistence.resetPasswordWithRecovery(
        issued.recoveryTokenWire,
        email,
        'Another-Password-123!',
      ),
      (error: unknown) =>
        error instanceof AuthPersistenceError && error.code === 'RECOVERY_CREDENTIAL_INVALID',
    );
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
    await assert.rejects(
      () => redeemRecoveryAsOwner(issued.recoveryTokenWire),
      (error: unknown) => (error as { code?: string }).code === 'P0001',
    );
  });


  await t.test('link external identity: create, idempotent, conflict, missing account', async () => {
    const { EXTERNAL_IDENTITY_PROVIDER_SUPABASE } = await import('./types');
    const provider = EXTERNAL_IDENTITY_PROVIDER_SUPABASE;
    const subjectA = `link-a-${marker}`;
    const subjectB = `link-b-${marker}`;

    const created = await linkExternalIdentityAsOwner(provider, subjectA, accountId);
    assert.equal(created.outcome, 'created');
    assert.equal(Number(created.account_id), accountId);
    assert.equal(created.provider, provider);
    assert.equal(created.subject, subjectA);

    const again = await linkExternalIdentityAsOwner(provider, subjectA, accountId);
    assert.equal(again.outcome, 'already_linked');
    assert.equal(again.id, created.id);
    assert.equal(Number(again.account_id), accountId);

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

    const conflict = await linkExternalIdentityAsOwner(provider, subjectA, otherAccountId);
    assert.equal(conflict.outcome, 'conflict');
    assert.equal(Number(conflict.account_id), accountId);
    assert.notEqual(Number(conflict.account_id), otherAccountId);

    const missing = await linkExternalIdentityAsOwner(provider, `missing-${marker}`, 9_007_199_254_740_991);
    assert.equal(missing.outcome, 'account_not_found');
    assert.equal(missing.id, null);
    assert.equal(missing.account_id, null);

    // Cross-product: two distinct supabase subjects → same GHM account (explicit link only)
    const secondSubject = await linkExternalIdentityAsOwner(provider, subjectB, accountId);
    assert.equal(secondSubject.outcome, 'created');
    assert.equal(Number(secondSubject.account_id), accountId);

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

    const linked = await linkExternalIdentityAsOwner(provider, subject, disabledId);
    assert.equal(linked.outcome, 'created');
    assert.equal(Number(linked.account_id), disabledId);

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

  await t.test('link external identity: runtime cannot read, mutate, create, or bootstrap mappings; migrator owner can link', async () => {
    const { EXTERNAL_IDENTITY_PROVIDER_SUPABASE } = await import('./types');
    const provider = EXTERNAL_IDENTITY_PROVIDER_SUPABASE;
    const subject = `acl-${marker}`;

    const runtimeClient = await runtimePool.connect();
    try {
      const privileges = await runtimeClient.query(`
        SELECT
          has_table_privilege(current_user, 'ghm.account_external_identity', 'SELECT') AS can_select,
          has_table_privilege(current_user, 'ghm.account_external_identity', 'INSERT') AS can_insert,
          has_table_privilege(current_user, 'ghm.account_external_identity', 'UPDATE') AS can_update,
          has_table_privilege(current_user, 'ghm.account_external_identity', 'DELETE') AS can_delete,
          has_sequence_privilege(current_user, 'ghm.account_external_identity_id_seq', 'USAGE') AS can_use_sequence,
          has_function_privilege(current_user, 'ghm.auth_link_external_identity(text,text,bigint)', 'EXECUTE') AS can_link,
          has_function_privilege(current_user, 'ghm.auth_bootstrap_external_identity(text,text,text,text)', 'EXECUTE') AS can_bootstrap
      `);
      assert.deepEqual(privileges.rows[0], {
        can_select: false,
        can_insert: false,
        can_update: false,
        can_delete: false,
        can_use_sequence: false,
        can_link: false,
        can_bootstrap: false,
      });

      for (const sql of [
        'SELECT * FROM ghm.account_external_identity',
        `SELECT * FROM ghm.auth_link_external_identity('supabase', 'runtime-forged-subject', ${accountId})`,
        `SELECT * FROM ghm.auth_bootstrap_external_identity('supabase', 'runtime-bootstrap-subject', 'Runtime Bootstrap', 'customer')`,
        `INSERT INTO ghm.account_external_identity (provider, subject, account_id)
         VALUES ('supabase', 'direct-runtime-insert', ${accountId})`,
        "SELECT nextval('ghm.account_external_identity_id_seq')",
      ]) {
        await assert.rejects(
          () => runtimeClient.query(sql),
          (error: unknown) => {
            const err = error as { code?: string; message?: string };
            return err.code === '42501' || Boolean(err.message?.match(/permission denied/i));
          },
        );
      }
    } finally {
      runtimeClient.release();
    }

    await assert.rejects(
      runtimePool.query('SELECT * FROM ghm.auth_link_external_identity($1, $2, $3)', [provider, subject, accountId]),
      /permission denied|insufficient_privilege/i,
    );
    const viaFunction = await linkExternalIdentityAsOwner(provider, subject, accountId);
    assert.equal(viaFunction.outcome, 'created');
    const lookedUp = await persistence.lookupExternalIdentity(provider, subject);
    assert.equal(lookedUp?.accountId, accountId);

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

  await t.test('password set via DEFINER', async () => {
    await setPasswordAsOwner(accountId, `user+${marker}@Example.COM`, 'CorrectHorseBattery1');
    const looked = await persistence.lookupPasswordByEmail(`user+${marker}@example.com`);
    assert.ok(looked);
    assert.equal(looked!.accountId, accountId);
    assert.match(looked!.passwordHash, /^\$argon2id\$/);
  });
});

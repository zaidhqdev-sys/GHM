/**
 * Persistence boundary for GHM Auth foundation.
 * Calls SECURITY DEFINER auth_* functions. Does not implement HTTP.
 */

import type { PoolClient } from 'pg';
import { withTransaction, type TransactionPool } from '../../db/transaction';
import { decodeOpaqueTokenWire, generateOpaqueToken } from './opaque-token';
import { loadTokenPepper, protectOpaqueToken } from './token-hmac';
import { defaultPasswordHasher, type PasswordHasher } from './password';
import { normalizeLoginEmail } from './email-normalization';
import type {
  AuthenticationSessionRecord,
  CreateSessionWithRefreshResult,
  ExternalIdentityMapping,
  LinkExternalIdentityOutcome,
  LinkExternalIdentityResult,
  LinkBusinessExternalMappingOutcome,
  LinkBusinessExternalMappingResult,
  PasswordCredentialLookup,
  PasswordHashResult,
  RotateRefreshResult,
  RevokeReason,
} from './types';

export class AuthPersistenceError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthPersistenceError';
  }
}

const mapSession = (row: Record<string, unknown>): AuthenticationSessionRecord => ({
  id: Number(row.session_id ?? row.id),
  accountId: Number(row.account_id),
  sessionStatus: row.session_status as AuthenticationSessionRecord['sessionStatus'],
  createdAt: row.created_at as Date,
  lastSeenAt: row.last_seen_at as Date,
  absoluteExpiresAt: row.absolute_expires_at as Date,
  revokedAt: (row.revoked_at as Date | null) ?? null,
  revokeReason: (row.revoke_reason as string | null) ?? null,
});

const raiseFromPg = (error: unknown): never => {
  const err = error as { message?: string; code?: string };
  const message = err.message ?? 'Auth persistence operation failed';
  if (message.includes('REFRESH_CREDENTIAL_REUSED')) {
    throw new AuthPersistenceError('Refresh credential reused', 'REFRESH_CREDENTIAL_REUSED');
  }
  if (message.includes('REFRESH_CREDENTIAL_INVALID')) {
    throw new AuthPersistenceError('Refresh credential invalid', 'REFRESH_CREDENTIAL_INVALID');
  }
  if (message.includes('RECOVERY_CREDENTIAL_INVALID')) {
    throw new AuthPersistenceError('Recovery credential invalid', 'RECOVERY_CREDENTIAL_INVALID');
  }
  if (message.includes('SESSION_REVOKED')) {
    throw new AuthPersistenceError('Session revoked', 'SESSION_REVOKED');
  }
  if (message.includes('SESSION_ABSOLUTE_EXPIRED')) {
    throw new AuthPersistenceError('Session absolute expired', 'SESSION_ABSOLUTE_EXPIRED');
  }
  if (message.includes('SESSION_INACTIVITY_EXPIRED')) {
    throw new AuthPersistenceError('Session inactivity expired', 'SESSION_INACTIVITY_EXPIRED');
  }
  if (message.includes('Account is disabled')) {
    throw new AuthPersistenceError('Account is disabled', 'ACCOUNT_DISABLED');
  }
  throw new AuthPersistenceError(message, err.code);
};

const mapPgError = (error: unknown): AuthPersistenceError => {
  try {
    raiseFromPg(error);
  } catch (mapped) {
    return mapped as AuthPersistenceError;
  }
  throw new AuthPersistenceError('Auth persistence operation failed');
};

export interface SessionValidationResult {
  sessionId: number;
  accountId: number | null;
  sessionStatus: string | null;
  accountStatus: string | null;
  createdAt: Date | null;
  lastSeenAt: Date | null;
  absoluteExpiresAt: Date | null;
  isUsable: boolean;
  rejectReason: string | null;
}

export interface CreateSessionResult extends CreateSessionWithRefreshResult {
  /** Raw refresh wire token — return to issuer only; never persist */
  refreshTokenWire: string;
}

export interface RotateRefreshPersistenceResult extends RotateRefreshResult {
  refreshTokenWire: string;
}

export interface AuthPersistence {
  setPassword(accountId: number, email: string, password: string): Promise<PasswordHashResult>;
  lookupPasswordByEmail(email: string): Promise<(PasswordCredentialLookup & { accountStatus: string }) | null>;
  createSessionWithRefresh(accountId: number): Promise<CreateSessionResult>;
  validateSession(sessionId: number): Promise<SessionValidationResult>;
  rotateRefresh(refreshTokenWire: string): Promise<RotateRefreshPersistenceResult>;
  revokeSession(sessionId: number, reason?: RevokeReason): Promise<boolean>;
  revokeAllSessionsForAccount(accountId: number, reason?: RevokeReason): Promise<number>;
  changePassword(
    accountId: number,
    keepSessionId: number,
    email: string,
    password: string,
  ): Promise<{ password: PasswordHashResult; revokedSessionCount: number }>;
  disableAccount(accountId: number): Promise<void>;
  issueRecovery(accountId: number, ttlMinutes?: number): Promise<{ recoveryTokenWire: string; credentialId: number; expiresAt: Date }>;
  redeemRecovery(recoveryTokenWire: string): Promise<number>;
  lookupExternalIdentity(provider: string, subject: string): Promise<ExternalIdentityMapping | null>;
  bootstrapExternalIdentity(
    provider: string,
    subject: string,
    fullName?: string | null,
    role?: 'customer' | 'business',
  ): Promise<ExternalIdentityMapping & { created: boolean }>;
  linkExternalIdentity(
    provider: string,
    subject: string,
    accountId: number,
  ): Promise<LinkExternalIdentityResult>;
  linkBusinessExternalMapping(
    provider: string,
    externalBusinessId: string,
    businessId: number,
  ): Promise<LinkBusinessExternalMappingResult>;
  revokeSessionByRefreshToken(refreshTokenWire: string, reason?: RevokeReason): Promise<{ found: boolean; sessionId: number | null; accountId: number | null }>;
}

type Queryable = Pick<PoolClient, 'query'>;

export class PostgresAuthPersistence implements AuthPersistence {
  constructor(
    private readonly transactionPool?: TransactionPool,
    private readonly passwordHasher: PasswordHasher = defaultPasswordHasher,
    private readonly pepper: Buffer = loadTokenPepper(),
  ) {}

  private async tx<T>(work: (client: Queryable) => Promise<T>): Promise<T> {
    return withTransaction(work, this.transactionPool);
  }

  async setPassword(accountId: number, email: string, password: string): Promise<PasswordHashResult> {
    const normalized = normalizeLoginEmail(email);
    const hashed = await this.passwordHasher.hash(password);
    try {
      await this.tx(async (client) => {
        await client.query(
          `SELECT ghm.auth_set_password($1, $2, $3, $4, $5, $6, $7)`,
          [
            accountId,
            normalized.loginEmail,
            normalized.loginEmailNormalized,
            hashed.passwordHash,
            hashed.argon2MemoryKib,
            hashed.argon2TimeCost,
            hashed.argon2Parallelism,
          ],
        );
      });
    } catch (error) {
      throw mapPgError(error);
    }
    return hashed;
  }

  async lookupPasswordByEmail(
    email: string,
  ): Promise<(PasswordCredentialLookup & { accountStatus: string }) | null> {
    const normalized = normalizeLoginEmail(email);
    const result = await this.tx(async (client) =>
      client.query(
        `SELECT * FROM ghm.auth_lookup_password_by_normalized_email($1)`,
        [normalized.loginEmailNormalized],
      ),
    );
    if (result.rowCount !== 1) return null;
    const row = result.rows[0];
    return {
      accountId: Number(row.account_id),
      loginEmail: String(row.login_email),
      loginEmailNormalized: String(row.login_email_normalized),
      passwordHash: String(row.password_hash),
      credentialStatus: row.credential_status,
      argon2MemoryKib: row.argon2_memory_kib,
      argon2TimeCost: row.argon2_time_cost,
      argon2Parallelism: row.argon2_parallelism,
      accountStatus: String(row.account_status),
    };
  }

  async createSessionWithRefresh(accountId: number): Promise<CreateSessionResult> {
    const token = generateOpaqueToken();
    const tokenHash = protectOpaqueToken(this.pepper, 'refresh', token.raw);
    try {
      const result = await this.tx(async (client) =>
        client.query(`SELECT * FROM ghm.auth_create_session_with_refresh($1, $2)`, [
          accountId,
          tokenHash,
        ]),
      );
      if (result.rowCount !== 1) throw new AuthPersistenceError('Session create failed');
      const row = result.rows[0];
      return {
        session: mapSession(row),
        refreshCredentialId: Number(row.refresh_credential_id),
        refreshTokenWire: token.wire,
      };
    } catch (error) {
      throw mapPgError(error);
    }
  }

  async validateSession(sessionId: number): Promise<SessionValidationResult> {
    const result = await this.tx(async (client) =>
      client.query(`SELECT * FROM ghm.auth_validate_session($1)`, [sessionId]),
    );
    if (result.rowCount !== 1) {
      throw new AuthPersistenceError('Session validation failed');
    }
    const row = result.rows[0];
    return {
      sessionId: Number(row.session_id),
      accountId: row.account_id == null ? null : Number(row.account_id),
      sessionStatus: row.session_status ?? null,
      accountStatus: row.account_status ?? null,
      createdAt: row.created_at ?? null,
      lastSeenAt: row.last_seen_at ?? null,
      absoluteExpiresAt: row.absolute_expires_at ?? null,
      isUsable: Boolean(row.is_usable),
      rejectReason: row.reject_reason ?? null,
    };
  }

  async rotateRefresh(refreshTokenWire: string): Promise<RotateRefreshPersistenceResult> {
    const presentedRaw = decodeOpaqueTokenWire(refreshTokenWire);
    const presentedHash = protectOpaqueToken(this.pepper, 'refresh', presentedRaw);
    const successor = generateOpaqueToken();
    const successorHash = protectOpaqueToken(this.pepper, 'refresh', successor.raw);
    let row: Record<string, unknown>;
    try {
      const result = await this.tx(async (client) =>
        client.query(`SELECT * FROM ghm.auth_rotate_refresh($1, $2)`, [
          presentedHash,
          successorHash,
        ]),
      );
      if (result.rowCount !== 1) throw new AuthPersistenceError('Refresh rotation failed');
      row = result.rows[0];
    } catch (error) {
      throw mapPgError(error);
    }

    // Replay revoke is committed above; map to error after commit so revocation persists.
    if (String(row.outcome) === 'replay') {
      throw new AuthPersistenceError('Refresh credential reused', 'REFRESH_CREDENTIAL_REUSED');
    }
    if (String(row.outcome) !== 'rotated') {
      throw new AuthPersistenceError('Refresh rotation failed');
    }

    return {
      session: mapSession(row),
      refreshCredentialId: Number(row.refresh_credential_id),
      refreshTokenWire: successor.wire,
    };
  }

  async revokeSession(sessionId: number, reason: RevokeReason = 'logout'): Promise<boolean> {
    try {
      const result = await this.tx(async (client) =>
        client.query(`SELECT ghm.auth_revoke_session($1, $2) AS revoked`, [sessionId, reason]),
      );
      return Boolean(result.rows[0]?.revoked);
    } catch (error) {
      throw mapPgError(error);
    }
  }

  async revokeAllSessionsForAccount(
    accountId: number,
    reason: RevokeReason = 'password_recovery',
  ): Promise<number> {
    try {
      const result = await this.tx(async (client) =>
        client.query(`SELECT ghm.auth_revoke_all_sessions_for_account($1, $2) AS count`, [
          accountId,
          reason,
        ]),
      );
      return Number(result.rows[0]?.count ?? 0);
    } catch (error) {
      throw mapPgError(error);
    }
  }

  async changePassword(
    accountId: number,
    keepSessionId: number,
    email: string,
    password: string,
  ): Promise<{ password: PasswordHashResult; revokedSessionCount: number }> {
    const normalized = normalizeLoginEmail(email);
    const hashed = await this.passwordHasher.hash(password);
    try {
      const result = await this.tx(async (client) =>
        client.query(
          `SELECT ghm.auth_change_password($1, $2, $3, $4, $5, $6, $7, $8) AS revoked`,
          [
            accountId,
            keepSessionId,
            normalized.loginEmail,
            normalized.loginEmailNormalized,
            hashed.passwordHash,
            hashed.argon2MemoryKib,
            hashed.argon2TimeCost,
            hashed.argon2Parallelism,
          ],
        ),
      );
      return {
        password: hashed,
        revokedSessionCount: Number(result.rows[0]?.revoked ?? 0),
      };
    } catch (error) {
      throw mapPgError(error);
    }
  }

  async disableAccount(accountId: number): Promise<void> {
    try {
      await this.tx(async (client) => {
        await client.query(`SELECT ghm.auth_disable_account($1)`, [accountId]);
      });
    } catch (error) {
      throw mapPgError(error);
    }
  }

  async issueRecovery(
    accountId: number,
    ttlMinutes: number = 30,
  ): Promise<{ recoveryTokenWire: string; credentialId: number; expiresAt: Date }> {
    const token = generateOpaqueToken();
    const tokenHash = protectOpaqueToken(this.pepper, 'recovery', token.raw);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    try {
      const result = await this.tx(async (client) =>
        client.query(`SELECT ghm.auth_issue_recovery($1, $2, $3) AS id`, [
          accountId,
          tokenHash,
          expiresAt.toISOString(),
        ]),
      );
      return {
        recoveryTokenWire: token.wire,
        credentialId: Number(result.rows[0].id),
        expiresAt,
      };
    } catch (error) {
      throw mapPgError(error);
    }
  }

  async redeemRecovery(recoveryTokenWire: string): Promise<number> {
    const raw = decodeOpaqueTokenWire(recoveryTokenWire);
    const tokenHash = protectOpaqueToken(this.pepper, 'recovery', raw);
    try {
      const result = await this.tx(async (client) =>
        client.query(`SELECT ghm.auth_redeem_recovery($1) AS account_id`, [tokenHash]),
      );
      return Number(result.rows[0].account_id);
    } catch (error) {
      throw mapPgError(error);
    }
  }

  async lookupExternalIdentity(
    provider: string,
    subject: string,
  ): Promise<ExternalIdentityMapping | null> {
    const result = await this.tx(async (client) =>
      client.query(`SELECT * FROM ghm.auth_lookup_external_identity($1, $2)`, [provider, subject]),
    );
    if (result.rowCount !== 1) return null;
    const row = result.rows[0];
    return {
      id: Number(row.id),
      provider: String(row.provider),
      subject: String(row.subject),
      accountId: Number(row.account_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async bootstrapExternalIdentity(
    provider: string,
    subject: string,
    fullName: string | null = null,
    role: 'customer' | 'business' = 'customer',
  ): Promise<ExternalIdentityMapping & { created: boolean }> {
    try {
      const result = await this.tx(async (client) =>
        client.query(`SELECT * FROM ghm.auth_bootstrap_external_identity($1, $2, $3, $4)`, [
          provider,
          subject,
          fullName,
          role,
        ]),
      );
      if (result.rowCount !== 1) throw new AuthPersistenceError('Bootstrap failed');
      const row = result.rows[0];
      return {
        id: Number(row.id),
        provider: String(row.provider),
        subject: String(row.subject),
        accountId: Number(row.account_id),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        created: Boolean(row.created),
      };
    } catch (error) {
      throw mapPgError(error);
    }
  }

  async linkExternalIdentity(
    provider: string,
    subject: string,
    accountId: number,
  ): Promise<LinkExternalIdentityResult> {
    try {
      const result = await this.tx(async (client) =>
        client.query(`SELECT * FROM ghm.auth_link_external_identity($1, $2, $3)`, [
          provider,
          subject,
          accountId,
        ]),
      );
      if (result.rowCount !== 1) throw new AuthPersistenceError('Link external identity failed');
      const row = result.rows[0];
      const outcome = String(row.outcome) as LinkExternalIdentityOutcome;
      if (outcome === 'account_not_found') {
        return { outcome, mapping: null };
      }
      if (
        outcome !== 'created' &&
        outcome !== 'already_linked' &&
        outcome !== 'conflict'
      ) {
        throw new AuthPersistenceError(`Unexpected link outcome: ${outcome}`, 'LINK_UNEXPECTED_OUTCOME');
      }
      return {
        outcome,
        mapping: {
          id: Number(row.id),
          provider: String(row.provider),
          subject: String(row.subject),
          accountId: Number(row.account_id),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    } catch (error) {
      throw mapPgError(error);
    }
  }

  async linkBusinessExternalMapping(
    provider: string,
    externalBusinessId: string,
    businessId: number,
  ): Promise<LinkBusinessExternalMappingResult> {
    try {
      const result = await this.tx(async (client) =>
        client.query(`SELECT * FROM ghm.auth_link_business_external_mapping($1, $2, $3)`, [
          provider,
          externalBusinessId,
          businessId,
        ]),
      );
      if (result.rowCount !== 1) {
        throw new AuthPersistenceError('Link business external mapping failed');
      }
      const row = result.rows[0];
      const outcome = String(row.outcome) as LinkBusinessExternalMappingOutcome;
      if (outcome === 'business_not_found') {
        return { outcome, mapping: null };
      }
      if (
        outcome !== 'created' &&
        outcome !== 'already_linked' &&
        outcome !== 'conflict'
      ) {
        throw new AuthPersistenceError(
          `Unexpected business link outcome: ${outcome}`,
          'LINK_UNEXPECTED_OUTCOME',
        );
      }
      return {
        outcome,
        mapping: {
          id: Number(row.id),
          provider: String(row.provider),
          externalBusinessId: String(row.external_business_id),
          businessId: Number(row.business_id),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    } catch (error) {
      throw mapPgError(error);
    }
  }

  async revokeSessionByRefreshToken(
    refreshTokenWire: string,
    reason: RevokeReason = 'logout',
  ): Promise<{ found: boolean; sessionId: number | null; accountId: number | null }> {
    const raw = decodeOpaqueTokenWire(refreshTokenWire);
    const tokenHash = protectOpaqueToken(this.pepper, 'refresh', raw);
    try {
      const result = await this.tx(async (client) =>
        client.query(`SELECT * FROM ghm.auth_revoke_by_refresh_hash($1, $2)`, [tokenHash, reason]),
      );
      if (result.rowCount !== 1) {
        return { found: false, sessionId: null, accountId: null };
      }
      const row = result.rows[0];
      return {
        found: Boolean(row.found),
        sessionId: row.session_id == null ? null : Number(row.session_id),
        accountId: row.account_id == null ? null : Number(row.account_id),
      };
    } catch (error) {
      throw mapPgError(error);
    }
  }
}

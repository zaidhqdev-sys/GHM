/**
 * GHM Auth HTTP application service (login / refresh / logout).
 * Issues ES256 access JWTs + opaque refresh credentials via foundation persistence.
 */

import {
  ACCESS_JWT_TTL_SECONDS,
  createAccessJwtService,
  type AccessJwtService,
} from './foundation/access-jwt';
import { loadEs256Keys } from './foundation/es256-keys';
import {
  AuthPersistenceError,
  PostgresAuthPersistence,
  type AuthPersistence,
} from './foundation/persistence';
import {
  createArgon2idPasswordHasher,
  type PasswordHasher,
} from './foundation/password';
import { EmailNormalizationError, normalizeLoginEmail } from './foundation/email-normalization';
import { PasswordPolicyError, validateRegistrationPassword } from './foundation/password-policy';

export class GhmAuthServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number = 401,
  ) {
    super(message);
    this.name = 'GhmAuthServiceError';
  }
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  sessionId: number;
  accountId: number;
}

export interface GhmAuthService {
  register?(input: { fullName?: string | null; role?: 'customer' | 'business'; email: string; password: string }): Promise<AuthTokenResponse>;
  login(email: string, password: string): Promise<AuthTokenResponse>;
  refresh(refreshToken: string): Promise<AuthTokenResponse>;
  logout(refreshToken: string): Promise<void>;
}

export const createGhmAuthService = (
  persistence: AuthPersistence = new PostgresAuthPersistence(),
  jwtService: AccessJwtService = createAccessJwtService(loadEs256Keys()),
  passwordHasher: PasswordHasher = createArgon2idPasswordHasher(),
): GhmAuthService => {
  let dummyHashPromise: Promise<string> | null = null;
  const dummyHash = async (): Promise<string> => {
    if (!dummyHashPromise) {
      dummyHashPromise = passwordHasher
        .hash('ghm-auth-timing-dummy-password')
        .then((result) => result.passwordHash);
    }
    return dummyHashPromise;
  };

  const issuePair = (
    accountId: number,
    sessionId: number,
    refreshTokenWire: string,
  ): AuthTokenResponse => ({
    accessToken: jwtService.sign(accountId),
    refreshToken: refreshTokenWire,
    tokenType: 'Bearer',
    expiresIn: ACCESS_JWT_TTL_SECONDS,
    sessionId,
    accountId,
  });

  const failCredentials = (): never => {
    throw new GhmAuthServiceError('Authentication required', 'INVALID_CREDENTIALS', 401);
  };

  return {
    async register(input: { fullName?: string | null; role?: 'customer' | 'business'; email: string; password: string }): Promise<AuthTokenResponse> {
      const role = input.role ?? 'customer';
      if (role !== 'customer' && role !== 'business') {
        throw new GhmAuthServiceError('Invalid registration role', 'INVALID_REGISTRATION', 400);
      }
      if (typeof input.email !== 'string' || typeof input.password !== 'string') {
        throw new GhmAuthServiceError('Invalid registration request', 'INVALID_REGISTRATION', 400);
      }
      try {
        validateRegistrationPassword(input.password);
      } catch (error) {
        if (error instanceof PasswordPolicyError) {
          throw new GhmAuthServiceError('Password policy violation', 'PASSWORD_POLICY_VIOLATION', 400);
        }
        throw error;
      }
      try {
        const normalized = normalizeLoginEmail(input.email);
        const created = await persistence.createAccount(
          typeof input.fullName === 'string' ? input.fullName : null,
          role,
          normalized.loginEmail,
          input.password,
        );
        const session = await persistence.createSessionWithRefresh(created.accountId);
        return issuePair(created.accountId, session.session.id, session.refreshTokenWire);
      } catch (error) {
        if (error instanceof EmailNormalizationError) {
          throw new GhmAuthServiceError('Invalid registration request', 'INVALID_REGISTRATION', 400);
        }
        if (error instanceof AuthPersistenceError) {
          const message = error.message.toLowerCase();
          if (message.includes('duplicate') || message.includes('unique')) {
            throw new GhmAuthServiceError('Registration conflict', 'ACCOUNT_ALREADY_EXISTS', 409);
          }
        }
        throw error;
      }
    },

    async login(email: string, password: string): Promise<AuthTokenResponse> {
      if (typeof email !== 'string' || typeof password !== 'string' || password.length === 0) {
        failCredentials();
      }

      let normalized;
      try {
        normalized = normalizeLoginEmail(email);
      } catch (error) {
        if (error instanceof EmailNormalizationError) failCredentials();
        throw error;
      }

      const credential = await persistence.lookupPasswordByEmail(normalized.loginEmail);
      if (!credential) {
        await passwordHasher.verify(await dummyHash(), password);
        throw new GhmAuthServiceError('Authentication required', 'INVALID_CREDENTIALS', 401);
      }

      const verified = await passwordHasher.verify(credential.passwordHash, password);
      if (!verified.verified) {
        throw new GhmAuthServiceError('Authentication required', 'INVALID_CREDENTIALS', 401);
      }

      if (credential.accountStatus !== 'active' || credential.credentialStatus !== 'active') {
        throw new GhmAuthServiceError('Authentication required', 'INVALID_CREDENTIALS', 401);
      }

      if (verified.needsRehash) {
        await persistence.setPassword(credential.accountId, credential.loginEmail, password);
      }

      const session = await persistence.createSessionWithRefresh(credential.accountId);
      return issuePair(credential.accountId, session.session.id, session.refreshTokenWire);
    },

    async refresh(refreshToken: string): Promise<AuthTokenResponse> {
      if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
        throw new GhmAuthServiceError('Authentication required', 'INVALID_REFRESH_CREDENTIAL', 401);
      }
      try {
        const rotated = await persistence.rotateRefresh(refreshToken.trim());
        return issuePair(
          rotated.session.accountId,
          rotated.session.id,
          rotated.refreshTokenWire,
        );
      } catch (error) {
        if (error instanceof AuthPersistenceError) {
          const code =
            error.code === 'REFRESH_CREDENTIAL_REUSED'
              ? 'REFRESH_CREDENTIAL_REUSED'
              : error.code === 'SESSION_INACTIVITY_EXPIRED' || error.code === 'SESSION_ABSOLUTE_EXPIRED'
                ? 'SESSION_EXPIRED'
                : error.code === 'SESSION_REVOKED'
                  ? 'SESSION_REVOKED'
                  : error.code === 'ACCOUNT_DISABLED'
                    ? 'INVALID_CREDENTIALS'
                    : 'INVALID_REFRESH_CREDENTIAL';
          throw new GhmAuthServiceError('Authentication required', code, 401);
        }
        throw new GhmAuthServiceError('Authentication required', 'INVALID_REFRESH_CREDENTIAL', 401);
      }
    },

    async logout(refreshToken: string): Promise<void> {
      if (typeof refreshToken !== 'string' || refreshToken.trim().length === 0) {
        throw new GhmAuthServiceError('Authentication required', 'AUTHENTICATION_REQUIRED', 401);
      }
      try {
        await persistence.revokeSessionByRefreshToken(refreshToken.trim(), 'logout');
      } catch (error) {
        if (
          error instanceof Error
          && (/Opaque token|must decode|non-empty string/i.test(error.message))
        ) {
          throw new GhmAuthServiceError('Authentication required', 'AUTHENTICATION_REQUIRED', 401);
        }
        throw error;
      }
    },
  };
};

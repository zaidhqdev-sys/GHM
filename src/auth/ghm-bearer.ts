/**
 * GHM ES256 bearer authentication (new path).
 * Does not use HS JWT_SECRET / request-context.ts.
 */

import type { Request } from 'express';
import type { PoolClient } from 'pg';
import {
  AccessJwtError,
  createAccessJwtService,
  type AccessJwtService,
} from './foundation/access-jwt';
import { loadEs256Keys, type LoadedEs256Keys } from './foundation/es256-keys';
import type { GhmAuthContext } from './ghm-auth-context';
import type { GhmRole } from './authorization';

export class GhmBearerAuthError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'GhmBearerAuthError';
  }
}

export interface AccountAuthState {
  accountId: number;
  accountStatus: 'active' | 'disabled';
  role: GhmRole;
  isSystemAdmin: boolean;
}

export interface AccountAuthStateStore {
  getAccountAuthState(accountId: number): Promise<AccountAuthState | null>;
}

type Queryable = Pick<PoolClient, 'query'>;

export class PostgresAccountAuthStateStore implements AccountAuthStateStore {
  constructor(private readonly queryable: Queryable) {}

  async getAccountAuthState(accountId: number): Promise<AccountAuthState | null> {
    const result = await this.queryable.query(
      `SELECT id, account_status, role, is_system_admin
         FROM ghm.account_identity
        WHERE id = $1`,
      [accountId],
    );
    if (result.rowCount !== 1) return null;
    const row = result.rows[0];
    const role = row.role;
    if (role !== 'admin' && role !== 'customer' && role !== 'business') return null;
    if (row.account_status !== 'active' && row.account_status !== 'disabled') return null;
    return {
      accountId: Number(row.id),
      accountStatus: row.account_status,
      role,
      isSystemAdmin: row.is_system_admin === true,
    };
  }
}

export interface GhmBearerAuthenticator {
  authenticate(req: Request): Promise<GhmAuthContext>;
  authenticateAndLoadState(req: Request): Promise<{ context: GhmAuthContext; state: AccountAuthState }>;
}

const defaultAccountStore = (): AccountAuthStateStore => {
  // Lazy-load pool so unit tests that only inject stores do not require full config.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pool } = require('../db/pool') as typeof import('../db/pool');
  return new PostgresAccountAuthStateStore(pool);
};

export const createGhmBearerAuthenticator = (
  jwtService?: AccessJwtService,
  accounts?: AccountAuthStateStore,
): GhmBearerAuthenticator => {
  const resolvedJwt = jwtService ?? createAccessJwtService(loadEs256Keys());
  const resolvedAccounts = accounts ?? defaultAccountStore();
  const extractBearer = (req: Request): string => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new GhmBearerAuthError('Authentication required');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new GhmBearerAuthError('Authentication required');
    }
    return token;
  };

  const verifyToContext = async (token: string): Promise<{ context: GhmAuthContext; state: AccountAuthState }> => {
    let verified;
    try {
      verified = resolvedJwt.verify(token);
    } catch (error) {
      if (error instanceof AccessJwtError) {
        throw new GhmBearerAuthError('Invalid authentication token');
      }
      throw new GhmBearerAuthError('Invalid authentication token');
    }

    const state = await resolvedAccounts.getAccountAuthState(verified.accountId);
    if (!state || state.accountStatus !== 'active') {
      // Missing and disabled both fail as authentication — no enumeration.
      throw new GhmBearerAuthError('Invalid authentication token');
    }

    return {
      context: Object.freeze({ accountId: state.accountId }),
      state,
    };
  };

  return {
    async authenticate(req: Request): Promise<GhmAuthContext> {
      const token = extractBearer(req);
      const { context } = await verifyToContext(token);
      return context;
    },

    async authenticateAndLoadState(req: Request) {
      const token = extractBearer(req);
      return verifyToContext(token);
    },
  };
};

/** Test helper: build authenticator with explicit key material. */
export const createGhmBearerAuthenticatorWithKeys = (
  keys: LoadedEs256Keys,
  accounts: AccountAuthStateStore,
): GhmBearerAuthenticator =>
  createGhmBearerAuthenticator(createAccessJwtService(keys), accounts);

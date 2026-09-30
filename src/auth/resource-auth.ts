/**
 * Governed resource API authentication seam.
 *
 * ES256 GHM access JWT (primary): verify → load account state → AuthContext from DB.
 * Legacy HS JWT (compatibility boundary): isolated to request-context.ts; JWT role is
 * legacy-only and must not be used for new GHM frontend auth.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthContext, GhmRole } from './authorization';
import { toLegacyAuthContext } from './ghm-auth-context';
import {
  createGhmBearerAuthenticator,
  GhmBearerAuthError,
  type AccountAuthState,
  type GhmBearerAuthenticator,
} from './ghm-bearer';
import { authenticateRequest } from './request-context';

export type BearerCredentialKind = 'ghm-es256' | 'legacy-hs' | 'unrecognized';

/** Classify Bearer JWT by header algorithm/kid — does not verify. */
export const classifyBearerCredential = (token: string): BearerCredentialKind => {
  const complete = jwt.decode(token, { complete: true });
  if (!complete || typeof complete === 'string') {
    return 'unrecognized';
  }
  const alg = complete.header.alg;
  if (alg === 'ES256') {
    const kid = complete.header.kid;
    if (typeof kid === 'string' && kid.length > 0) {
      return 'ghm-es256';
    }
    return 'unrecognized';
  }
  if (alg === 'HS256' || alg === 'HS384' || alg === 'HS512') {
    return 'legacy-hs';
  }
  return 'unrecognized';
};

/** Coarse resource role from authoritative GHM account state (not JWT). */
export const resolveResourceAuthRole = (state: AccountAuthState): GhmRole => {
  if (state.isSystemAdmin) {
    return 'admin';
  }
  return state.role;
};

export const authContextFromAccountState = (
  accountId: number,
  state: AccountAuthState,
): AuthContext => toLegacyAuthContext({ accountId }, resolveResourceAuthRole(state));

export interface ResourceAuthDependencies {
  readonly ghmAuthenticator?: GhmBearerAuthenticator;
}

const respondUnauthorized = (res: Response): void => {
  res.status(401).json({ error: 'unauthorized' });
};

export const createRequireResourceAuth = (
  dependencies: ResourceAuthDependencies = {},
): RequestHandler => {
  let ghmAuthenticator = dependencies.ghmAuthenticator;
  const resolveGhmAuthenticator = (): GhmBearerAuthenticator => {
    if (!ghmAuthenticator) {
      ghmAuthenticator = createGhmBearerAuthenticator();
    }
    return ghmAuthenticator;
  };

  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      respondUnauthorized(res);
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      respondUnauthorized(res);
      return;
    }

    const kind = classifyBearerCredential(token);
    if (kind === 'legacy-hs') {
      try {
        req.authContext = authenticateRequest(req);
        next();
      } catch {
        respondUnauthorized(res);
      }
      return;
    }

    if (kind === 'ghm-es256') {
      void resolveGhmAuthenticator()
        .authenticateAndLoadState(req)
        .then(({ context, state }) => {
          req.ghmAuthContext = context;
          req.authContext = authContextFromAccountState(context.accountId, state);
          next();
        })
        .catch((error: unknown) => {
          if (!(error instanceof GhmBearerAuthError)) {
            console.error(JSON.stringify({
              event: 'resource_auth_ghm_failed',
              error: { name: error instanceof Error ? error.name : 'UnknownError' },
            }));
          }
          respondUnauthorized(res);
        });
      return;
    }

    respondUnauthorized(res);
  };
};

let defaultResourceAuthMiddleware: RequestHandler | undefined;

/** Resource routes: ES256 GHM Auth (DB-backed AuthContext) + isolated legacy HS boundary. */
export const requireResourceAuth: RequestHandler = (req, res, next) => {
  if (!defaultResourceAuthMiddleware) {
    defaultResourceAuthMiddleware = createRequireResourceAuth();
  }
  defaultResourceAuthMiddleware(req, res, next);
};

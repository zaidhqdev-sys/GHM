/**
 * Governed resource API authentication seam.
 *
 * GHM ES256 access JWT: verify → load account state → AuthContext from DB.
 * All other bearer credential forms fail closed.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthContext, GhmRole } from './authorization';
import { toLegacyAuthContext } from './ghm-auth-context';
import {
  createGhmBearerAuthenticator,
  GhmBearerAuthError,
  type AccountAuthState,
  type GhmBearerAuthenticator,
} from './ghm-bearer';

export const resolveResourceAuthRole = (state: AccountAuthState): GhmRole => {
  if (state.isSystemAdmin) return 'admin';
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
    if (!ghmAuthenticator) ghmAuthenticator = createGhmBearerAuthenticator();
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
  };
};

let defaultResourceAuthMiddleware: RequestHandler | undefined;

/** Resource routes: GHM ES256 Auth with DB-backed AuthContext. */
export const requireResourceAuth: RequestHandler = (req, res, next) => {
  if (!defaultResourceAuthMiddleware) {
    defaultResourceAuthMiddleware = createRequireResourceAuth();
  }
  defaultResourceAuthMiddleware(req, res, next);
};

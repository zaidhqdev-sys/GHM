/**
 * GHM ES256 Auth HTTP middleware (new path).
 * Leaves HS requireAuth / request-context unchanged.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  createGhmBearerAuthenticator,
  GhmBearerAuthError,
  type GhmBearerAuthenticator,
} from './ghm-bearer';
import type { GhmAuthContext } from './ghm-auth-context';

declare global {
  namespace Express {
    interface Request {
      ghmAuthContext?: GhmAuthContext;
    }
  }
}

export const createRequireGhmAuth = (
  authenticator?: GhmBearerAuthenticator,
): RequestHandler => {
  const resolved = authenticator ?? createGhmBearerAuthenticator();
  return (req: Request, res: Response, next: NextFunction): void => {
    void resolved
      .authenticate(req)
      .then((context) => {
        req.ghmAuthContext = context;
        next();
      })
      .catch((error: unknown) => {
        if (!(error instanceof GhmBearerAuthError)) {
          console.error(JSON.stringify({
            event: 'ghm_auth_middleware_failed',
            error: { name: error instanceof Error ? error.name : 'UnknownError' },
          }));
        }
        res.status(401).json({ error: 'unauthorized' });
      });
  };
};

/** Lazy default middleware — does not load ES256 keys until first request. */
export const requireGhmAuth: RequestHandler = (req, res, next) => {
  createRequireGhmAuth()(req, res, next);
};

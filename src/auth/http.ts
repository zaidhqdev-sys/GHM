import { Request, RequestHandler, Response } from 'express';
import { AuthContext } from './authorization';
import { authenticateRequest } from './request-context';
import { createRequireResourceAuth, requireResourceAuth } from './resource-auth';

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

/** Legacy HS JWT only — local/tests; not for new GHM frontend. */
export const requireLegacyAuth: RequestHandler = (req: Request, res: Response, next): void => {
  try {
    req.authContext = authenticateRequest(req);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
};

/** Governed resource API authentication (ES256 + temporary legacy HS coexistence). */
export const requireAuth: RequestHandler = requireResourceAuth;

export { createRequireResourceAuth };

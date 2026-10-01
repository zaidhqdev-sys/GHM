import { Request, RequestHandler, Response } from 'express';
import { AuthContext } from './authorization';
import { createRequireResourceAuth, requireResourceAuth } from './resource-auth';

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

/** Governed resource API authentication (GHM ES256 only). */
export const requireAuth: RequestHandler = requireResourceAuth;

export { createRequireResourceAuth };

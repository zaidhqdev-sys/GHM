import { Request, RequestHandler, Response } from 'express';
import { AuthContext } from './authorization';
import { authenticateRequest } from './request-context';

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

export const requireAuth: RequestHandler = (req: Request, res: Response, next): void => {
  try {
    req.authContext = authenticateRequest(req);
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication required';
    const status = message === 'Authentication required' || message === 'Invalid authentication token' ? 401 : 401;
    res.status(status).json({ error: 'unauthorized' });
  }
};

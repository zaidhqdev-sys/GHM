import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';
import type { CommercialService } from '../resources/commercial/contracts';

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const requireCommercialRead: RequestHandler = (req, res, next) => {
  const context = req.authContext as AuthContext | undefined;
  if (!context || !isRegisteredOperation('commercial', 'read') || !canAccessResource(context, 'commercial')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const sendError = (error: unknown, res: Response): void => {
  if (error instanceof Error && error.message === 'Business read permission required') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  console.error(JSON.stringify({
    event: 'commercial_read_failed',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerCommercialRoutes = (
  app: Express,
  service: CommercialService,
  resourceAuthMiddleware: RequestHandler,
): void => {
  app.get('/api/v1/commercial/access/:businessId', resourceAuthMiddleware, requireCommercialRead, async (req: Request, res: Response) => {
    const businessId = positiveIntegerId(req.params.businessId);
    const context = req.authContext as AuthContext | undefined;
    if (!businessId || !context) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      res.status(200).json({ result: await service.getCommercialAccess(context, businessId) });
    } catch (error) {
      sendError(error, res);
    }
  });

  app.get('/api/v1/commercial/subscription/:businessId', resourceAuthMiddleware, requireCommercialRead, async (req: Request, res: Response) => {
    const businessId = positiveIntegerId(req.params.businessId);
    const context = req.authContext as AuthContext | undefined;
    if (!businessId || !context) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      res.status(200).json({ result: await service.getCommercialSubscription(context, businessId) });
    } catch (error) {
      sendError(error, res);
    }
  });
};

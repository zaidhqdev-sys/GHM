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
  if (error instanceof Error && ['Business read permission required', 'Business management permission required'].includes(error.message)) {
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
  app.get('/api/v1/commercial/offer/:businessId', resourceAuthMiddleware, requireCommercialRead, async (req: Request, res: Response) => {
    const businessId = positiveIntegerId(req.params.businessId);
    const context = req.authContext as AuthContext | undefined;
    const planCode = typeof req.query.planCode === 'string' ? req.query.planCode.trim() : '';
    if (!businessId || !context || !/^[a-z][a-z0-9_]{2,49}$/.test(planCode) || Object.keys(req.query).some(key => key !== 'planCode')) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      const offer = await service.getCommercialOffer(context, businessId, planCode);
      if (!offer) {
        res.status(404).json({ error: 'offer_not_found' });
        return;
      }
      res.status(200).json({ result: offer });
    } catch (error) {
      sendError(error, res);
    }
  });

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

import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';
import type { BusinessAnalyticsService } from '../resources/business-analytics/contracts';

export const registerBusinessAnalyticsRoutes = (app: Express, service: BusinessAnalyticsService, authMiddleware: RequestHandler): void => {
  app.get('/api/v1/businesses/:businessId/analytics', authMiddleware, (req: Request, res: Response, next) => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('business_analytics', 'read') || !canAccessResource(context, 'business_analytics')) { res.status(403).json({ error: 'forbidden' }); return; }
    next();
  }, async (req: Request, res: Response) => {
    const businessId = typeof req.params.businessId === 'string' && /^[1-9]\d*$/.test(req.params.businessId) ? Number(req.params.businessId) : NaN;
    const rawDays = req.query.days ?? '30';
    const days = typeof rawDays === 'string' && ['7','30','90'].includes(rawDays) ? Number(rawDays) as 7 | 30 | 90 : NaN;
    if (!Number.isSafeInteger(businessId) || ![7,30,90].includes(days)) { res.status(400).json({ error: 'invalid_request' }); return; }
    try { res.status(200).json({ analytics: await service.getDashboard(req.authContext as AuthContext, businessId, days) }); }
    catch (error) {
      if (error instanceof Error && error.message === 'Business analytics access required') { res.status(403).json({ error: 'forbidden' }); return; }
      if (error instanceof Error && error.message === 'businessId must be a positive integer') { res.status(400).json({ error: 'invalid_request' }); return; }
      res.status(500).json({ error: 'internal_error' });
    }
  });
};

import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import type { BusinessAnalyticsService } from '../resources/business-analytics/service';

const positiveId = (value: string | string[] | undefined): number | null => {
  if (typeof value !== 'string' || !/^[1-9]\\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const parseEvent = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const businessId = typeof value.businessId === 'number' ? value.businessId : Number(value.businessId);
  if (!Number.isSafeInteger(businessId) || businessId <= 0) return null;
  if (typeof value.eventType !== 'string' || typeof value.source !== 'string') return null;
  if (!value.context || typeof value.context !== 'object' || Array.isArray(value.context)) return null;
  return {
    businessId,
    eventType: value.eventType,
    source: value.source,
    context: value.context,
  };
};

export const registerBusinessAnalyticsRoutes = (
  app: Express,
  service: BusinessAnalyticsService,
  authMiddleware: RequestHandler = requireAuth,
): void => {
  const optionalAuth: RequestHandler = (req, res, next) => {
    if (!req.header('authorization')) { next(); return; }
    authMiddleware(req, res, next);
  };

  // Public interaction facts may be recorded by anonymous directory visitors.
  // The actor identity is always derived from verified middleware context, never
  // accepted from the request body.
  app.post('/api/v1/business-engagement-events', optionalAuth, async (req: Request, res: Response) => {
    try {
      const input = parseEvent(req.body);
      if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
      const event = await service.recordEngagementEvent(
        (req.authContext as AuthContext | undefined) ?? null,
        input as Parameters<BusinessAnalyticsService['recordEngagementEvent']>[1],
      );
      if (!event) { res.status(204).end(); return; }
      res.status(201).json({ event: {
        id: event.id, businessId: event.businessId,
        eventType: event.eventType, occurredAt: event.occurredAt,
      } });
    } catch (error) {
      if (error instanceof Error && (
        error.message === 'businessId must be a positive integer'
        || error.message.startsWith('Invalid engagement')
      )) { res.status(400).json({ error: 'invalid_request' }); return; }
      if (error instanceof Error && error.message === 'Public Business not found') {
        res.status(404).json({ error: 'not_found' }); return;
      }
      console.error(JSON.stringify({ event: 'business_engagement_record_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.get('/api/v1/businesses/:businessId/analytics', authMiddleware, async (req: Request, res: Response) => {
    try {
      const businessId = positiveId(req.params.businessId);
      const rawDays = req.query.days;
      const days = rawDays === undefined ? 30 : typeof rawDays === 'string' ? Number(rawDays) : NaN;
      if (businessId === null || ![7, 30, 90].includes(days)) {
        res.status(400).json({ error: 'invalid_request' }); return;
      }
      const analytics = await service.getDashboard(req.authContext as AuthContext, businessId, days);
      if (!analytics) { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ analytics });
    } catch (error) {
      if (error instanceof Error && error.message === 'Authentication required') {
        res.status(401).json({ error: 'unauthorized' }); return;
      }
      console.error(JSON.stringify({ event: 'business_analytics_read_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
      res.status(500).json({ error: 'internal_error' });
    }
  });
};

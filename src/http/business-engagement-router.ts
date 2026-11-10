import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';
import { BUSINESS_ENGAGEMENT_EVENT_TYPES, type BusinessEngagementService, type RecordBusinessEngagementInput } from '../resources/business-engagement/contracts';

const parseInput = (body: unknown): RecordBusinessEngagementInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some(key => !['businessId', 'eventType', 'context', 'source'].includes(key))) return null;
  if (!Number.isSafeInteger(input.businessId) || (input.businessId as number) <= 0) return null;
  if (typeof input.eventType !== 'string' || !BUSINESS_ENGAGEMENT_EVENT_TYPES.includes(input.eventType as any)) return null;
  if (input.context !== undefined && (!input.context || typeof input.context !== 'object' || Array.isArray(input.context))) return null;
  if (input.source !== undefined && input.source !== 'web' && input.source !== 'mobile') return null;
  return { businessId: input.businessId as number, eventType: input.eventType as RecordBusinessEngagementInput['eventType'], context: input.context as RecordBusinessEngagementInput['context'], source: input.source as RecordBusinessEngagementInput['source'] };
};
export const registerBusinessEngagementRoutes = (app: Express, service: BusinessEngagementService, authMiddleware: RequestHandler): void => {
  app.post('/api/v1/business-engagement-events', authMiddleware, (req: Request, res: Response, next) => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('business_engagement', 'create') || !canAccessResource(context, 'business_engagement')) { res.status(403).json({ error: 'forbidden' }); return; }
    next();
  }, async (req: Request, res: Response, next) => {
    const input = parseInput(req.body);
    if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
    try { res.status(201).json({ event: await service.record(req.authContext as AuthContext, input) }); }
    catch (error) {
      if (error instanceof Error && ['businessId must be a positive integer','Unsupported engagement event type','Invalid engagement source','Invalid engagement context'].includes(error.message)) { res.status(400).json({ error: 'invalid_request' }); return; }
      if (error instanceof Error && error.message === 'Business not found') { res.status(404).json({ error: 'not_found' }); return; }
      if (error instanceof Error && error.message === 'Engagement rate limit exceeded') { res.status(429).json({ error: 'rate_limited' }); return; }
      next(error);
    }
  });
};

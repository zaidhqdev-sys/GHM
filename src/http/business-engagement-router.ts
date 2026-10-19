import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';
import type { BusinessEngagementService, RecordBusinessEngagementInput } from '../resources/business-engagement/contracts';

const parseInput = (body: unknown): RecordBusinessEngagementInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = ['businessId', 'eventType', 'context', 'source'];
  if (Object.keys(input).some(key => !allowed.includes(key))) return null;
  if (!Number.isSafeInteger(input.businessId) || (input.businessId as number) <= 0) return null;
  if (typeof input.eventType !== 'string') return null;
  if (input.context !== undefined && (!input.context || typeof input.context !== 'object' || Array.isArray(input.context))) return null;
  if (input.source !== undefined && input.source !== 'web' && input.source !== 'mobile') return null;
  return {
    businessId: input.businessId as number,
    eventType: input.eventType as RecordBusinessEngagementInput['eventType'],
    context: input.context as RecordBusinessEngagementInput['context'],
    source: input.source as RecordBusinessEngagementInput['source'],
  };
};

export const registerBusinessEngagementRoutes = (
  app: Express,
  service: BusinessEngagementService,
  authMiddleware: RequestHandler,
): void => {
  app.post('/api/v1/business-engagement-events', authMiddleware, (req: Request, res: Response, next) => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('business_engagement', 'create') || !canAccessResource(context, 'business_engagement')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  }, async (req: Request, res: Response) => {
    const context = req.authContext as AuthContext;
    const input = parseInput(req.body);
    if (!input) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      const event = await service.record(context, input);
      res.status(201).json({ event });
    } catch (error) {
      if (error instanceof Error && (error.message === 'Business not found' || error.message === 'Unsupported engagement event type' || error.message === 'Invalid engagement context' || error.message === 'Invalid engagement source' || error.message === 'Engagement input is required' || error.message === 'businessId must be a positive integer')) {
        res.status(error.message === 'Business not found' ? 404 : 400).json({ error: error.message === 'Business not found' ? 'not_found' : 'invalid_request' });
        return;
      }
      next(error);
    }
  });
};

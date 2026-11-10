import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';
import type { RelationshipsOutcomesService } from '../resources/relationships-outcomes/contracts';

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseQuery = (query: Request['query']): { status?: string; limit: number } | null => {
  if (Object.keys(query).some(key => !['status', 'limit'].includes(key))) return null;
  if (query.status !== undefined && (typeof query.status !== 'string' || !/^[a-z_]+$/.test(query.status))) return null;
  if (query.limit !== undefined && typeof query.limit !== 'string') return null;
  const limit = query.limit === undefined ? 100 : Number(query.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return null;
  return { status: typeof query.status === 'string' ? query.status : undefined, limit };
};

const requireDomainRead = (resource: 'business_relationship' | 'outcome'): RequestHandler =>
  (req, res, next) => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation(resource, 'read') || !canAccessResource(context, resource)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error && error.message === 'Business read permission required') {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  if (error instanceof Error && (
    error.message === 'businessId must be a positive integer'
    || error.message === 'limit must be between 1 and 100'
    || error.message === 'Invalid relationship lifecycle status'
    || error.message === 'Invalid outcome lifecycle status'
  )) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  console.error(JSON.stringify({
    event: 'relationships_outcomes_read_failed',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerRelationshipsOutcomesRoutes = (
  app: Express,
  service: RelationshipsOutcomesService,
  authMiddleware: RequestHandler,
): void => {
  app.get('/api/v1/businesses/:businessId/relationships', authMiddleware, requireDomainRead('business_relationship'), async (req: Request, res: Response) => {
    const context = req.authContext as AuthContext;
    const businessId = positiveIntegerId(req.params.businessId);
    const query = parseQuery(req.query);
    if (businessId === null || !query) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      const relationships = await service.getBusinessRelationships(context, businessId, query.status as never, query.limit);
      res.status(200).json({ relationships });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get('/api/v1/businesses/:businessId/outcomes', authMiddleware, requireDomainRead('outcome'), async (req: Request, res: Response) => {
    const context = req.authContext as AuthContext;
    const businessId = positiveIntegerId(req.params.businessId);
    const query = parseQuery(req.query);
    if (businessId === null || !query) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      const outcomes = await service.getBusinessOutcomes(context, businessId, query.status as never, query.limit);
      res.status(200).json({ outcomes });
    } catch (error) {
      handleError(error, res);
    }
  });
};

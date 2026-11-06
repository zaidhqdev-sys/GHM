import type { Express, NextFunction, Request, Response, RequestHandler } from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation, ResourceOperation } from '../resources/registry';
import type { CreateOpportunityInput, OpportunityService } from '../resources/opportunity/contracts';
import { PostgresOpportunityRepository } from '../resources/opportunity/repository';
import { OpportunityServiceImpl } from '../resources/opportunity/service';

const requireRegisteredOpportunityAccess = (operation: ResourceOperation) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('opportunity', operation) || !canAccessResource(context, 'opportunity')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};


const parseCreateOpportunityInput = (body: unknown): CreateOpportunityInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set([
    'opportunityTypeId', 'ownerBusinessId', 'countryId', 'currencyId',
    'title', 'description', 'visibility', 'budgetMin', 'budgetMax',
    'opensAt', 'closesAt',
  ]);
  if (Object.keys(input).some(key => !allowed.has(key))) return null;
  if (typeof input.opportunityTypeId !== 'number' || !Number.isSafeInteger(input.opportunityTypeId) || input.opportunityTypeId <= 0) return null;
  if (typeof input.title !== 'string' || !input.title.trim()) return null;
  if (typeof input.description !== 'string' || !input.description.trim()) return null;
  for (const key of ['ownerBusinessId', 'countryId', 'currencyId']) {
    const value = input[key];
    if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)) return null;
  }
  for (const key of ['budgetMin', 'budgetMax']) {
    const value = input[key];
    if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return null;
  }
  if (input.visibility !== undefined && !['private', 'participants', 'authenticated', 'public'].includes(String(input.visibility))) return null;
  const dateValue = (value: unknown): Date | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const opensAt = dateValue(input.opensAt);
  const closesAt = dateValue(input.closesAt);
  if ((input.opensAt !== undefined && opensAt === null && input.opensAt !== null)
    || (input.closesAt !== undefined && closesAt === null && input.closesAt !== null)) return null;
  return {
    opportunityTypeId: Number(input.opportunityTypeId),
    ...(input.ownerBusinessId !== undefined ? { ownerBusinessId: input.ownerBusinessId as number | null } : {}),
    ...(input.countryId !== undefined ? { countryId: input.countryId as number | null } : {}),
    ...(input.currencyId !== undefined ? { currencyId: input.currencyId as number | null } : {}),
    title: input.title,
    description: input.description,
    ...(input.visibility !== undefined ? { visibility: input.visibility as CreateOpportunityInput['visibility'] } : {}),
    ...(input.budgetMin !== undefined ? { budgetMin: input.budgetMin as number | null } : {}),
    ...(input.budgetMax !== undefined ? { budgetMax: input.budgetMax as number | null } : {}),
    ...(input.opensAt !== undefined ? { opensAt: opensAt as Date | null } : {}),
    ...(input.closesAt !== undefined ? { closesAt: closesAt as Date | null } : {}),
  };
};

const handleOpportunityError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Business management permission required') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (
      error.message.includes('must be a positive integer') ||
      error.message.includes('must be between ') ||
      error.message.includes('must be null or a non-negative number') ||
      error.message === 'budgetMax must be greater than or equal to budgetMin' ||
      error.message === 'closesAt must be greater than or equal to opensAt' ||
      error.message === 'Public Opportunities require an explicit lifecycle transition' ||
      error.message === 'Opportunity type not found or inactive' ||
      error.message.startsWith('Invalid ')
    ) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
  }
  console.error(JSON.stringify({
    event: 'http_request_failed',
    resource: 'opportunity',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerOpportunityRoutes = (
  app: Express,
  service: OpportunityService = new OpportunityServiceImpl(new PostgresOpportunityRepository()),
  authMiddleware: RequestHandler = requireAuth,
): void => {

  app.post(
    '/api/v1/opportunities',
    authMiddleware,
    requireRegisteredOpportunityAccess('create'),
    async (req: Request, res: Response) => {
      try {
        const input = parseCreateOpportunityInput(req.body);
        if (!input) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const opportunity = await service.createOpportunity(req.authContext as AuthContext, input);
        res.status(201).json({ opportunity });
      } catch (error) {
        handleOpportunityError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/opportunities/:opportunityId',
    authMiddleware,
    requireRegisteredOpportunityAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const rawId = routeParam(req.params.opportunityId);
        const opportunityId = rawId === null ? null : positiveIntegerId(rawId);
        if (opportunityId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }

        const opportunity = await service.getOpportunity(context, opportunityId);
        if (!opportunity) {
          res.status(404).json({ error: 'not_found' });
          return;
        }

        res.status(200).json({ opportunity });
      } catch (error) {
        handleOpportunityError(error, res);
      }
    },
  );
};

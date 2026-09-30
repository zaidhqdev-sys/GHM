import type { Express, NextFunction, Request, Response } from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation, ResourceOperation } from '../resources/registry';
import type { OpportunityService } from '../resources/opportunity/contracts';
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

const handleOpportunityError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (
      error.message.includes('must be a positive integer') ||
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
): void => {
  app.get(
    '/api/v1/opportunities/:opportunityId',
    requireAuth,
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

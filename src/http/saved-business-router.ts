import { Express, Request, Response } from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import type { CreateSavedBusinessInput, SavedBusinessService } from '../resources/saved-business/contracts';
import { isRegisteredOperation } from '../resources/registry';

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseCreateInput = (body: unknown): CreateSavedBusinessInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'businessId')) return null;
  if (!Number.isSafeInteger(input.businessId) || (input.businessId as number) <= 0) return null;
  return { businessId: input.businessId as number };
};

const requireSavedBusinessAccess = (
  operation: 'read' | 'create' | 'delete',
) => (req: Request, res: Response, next: () => void): void => {
  const context = req.authContext as AuthContext | undefined;
  if (
    !context ||
    !isRegisteredOperation('saved_business', operation) ||
    !canAccessResource(context, 'saved_business')
  ) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Saved Business not found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (
      error.message === 'Saved Business input is required' ||
      error.message === 'businessId must be a positive integer' ||
      error.message === 'savedBusinessId must be a positive integer'
    ) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
  }
  console.error(JSON.stringify({
    event: 'http_request_failed',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerSavedBusinessRoutes = (
  app: Express,
  savedBusinessService: SavedBusinessService,
): void => {
  app.get(
    '/api/v1/saved-businesses',
    requireAuth,
    requireSavedBusinessAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const savedBusinesses = await savedBusinessService.listSavedBusinesses(context);
        res.status(200).json({ savedBusinesses });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/saved-businesses/:savedBusinessId',
    requireAuth,
    requireSavedBusinessAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const value = routeParam(req.params.savedBusinessId);
        const savedBusinessId = value === null ? null : positiveIntegerId(value);
        if (savedBusinessId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const savedBusiness = await savedBusinessService.getSavedBusiness(context, savedBusinessId);
        if (!savedBusiness) {
          res.status(404).json({ error: 'not_found' });
          return;
        }
        res.status(200).json({ savedBusiness });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.post(
    '/api/v1/saved-businesses',
    requireAuth,
    requireSavedBusinessAccess('create'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const input = parseCreateInput(req.body);
        if (!input) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const savedBusiness = await savedBusinessService.createSavedBusiness(context, input);
        res.status(201).json({ savedBusiness });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.delete(
    '/api/v1/saved-businesses/:savedBusinessId',
    requireAuth,
    requireSavedBusinessAccess('delete'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const value = routeParam(req.params.savedBusinessId);
        const savedBusinessId = value === null ? null : positiveIntegerId(value);
        if (savedBusinessId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        await savedBusinessService.deleteSavedBusiness(context, savedBusinessId);
        res.status(204).send();
      } catch (error) {
        handleError(error, res);
      }
    },
  );
};

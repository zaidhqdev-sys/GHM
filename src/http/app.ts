import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { PostgresBusinessIdentityRepository } from '../resources/business-identity/repository';
import { BusinessIdentityServiceImpl } from '../resources/business-identity/service';
import { BusinessIdentityService, UpdateBusinessProfileInput } from '../resources/business-identity/contracts';
import { isRegisteredOperation, ResourceOperation } from '../resources/registry';
import { config } from '../config';

export interface AppDependencies {
  readonly businessIdentityService?: BusinessIdentityService;
}

const requireRegisteredAccess = (resource: Parameters<typeof canAccessResource>[1], operation: ResourceOperation) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation(resource, operation) || !canAccessResource(context, resource)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseCreateBusinessInput = (body: unknown): { name: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.name !== 'string' || !input.name.trim()) return null;
  return { name: input.name };
};

const parseUpdateBusinessInput = (body: unknown): UpdateBusinessProfileInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => key !== 'name' && key !== 'slug')) return null;
  if (Object.hasOwn(input, 'name') && (typeof input.name !== 'string' || !input.name.trim())) return null;
  if (Object.hasOwn(input, 'slug') && (typeof input.slug !== 'string' || !input.slug.trim())) return null;
  return {
    ...(Object.hasOwn(input, 'name') ? { name: input.name as string } : {}),
    ...(Object.hasOwn(input, 'slug') ? { slug: input.slug as string } : {}),
  };
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Business creation requires a business operator role' || error.message === 'Business management permission required') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (error.message === 'Authenticated account not found' || error.message === 'Business not found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (error.message === 'Business creation requires no existing active business membership' || (error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'conflict' });
      return;
    }
  }
  console.error('HTTP request failed:', error);
  res.status(500).json({ error: 'internal_error' });
};

export const createApp = (dependencies: AppDependencies = {}): express.Express => {
  const app = express();
  const service = dependencies.businessIdentityService ?? new BusinessIdentityServiceImpl(new PostgresBusinessIdentityRepository());

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req: Request, res: Response) => {
    res.json({ service: 'GHM Core Engine', version: '2.0.0' });
  });

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/v1/profile', requireAuth, requireRegisteredAccess('profile', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const profile = await service.getOwnProfile(context);
      res.status(200).json({ profile });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get('/api/v1/businesses/:businessId', requireAuth, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const businessId = positiveIntegerId(req.params.businessId);
      if (businessId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const business = await service.getPublicBusiness(context, businessId);
      if (!business) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ business });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get('/api/v1/businesses/slug/:slug', requireAuth, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const slug = req.params.slug.trim();
      if (!slug) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const business = await service.getPublicBusinessBySlug(context, slug);
      if (!business) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ business });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.post('/api/v1/businesses', requireAuth, requireRegisteredAccess('business', 'create'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const input = parseCreateBusinessInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const identity = await service.createBusiness(context, input);
      res.status(201).json({ business: identity.activeBusiness, membership: identity.activeMembership });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.get('/api/v1/businesses/:businessId/managed', requireAuth, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const businessId = positiveIntegerId(req.params.businessId);
      if (businessId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const business = await service.getManagedBusiness(context, businessId);
      if (!business) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ business });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.patch('/api/v1/businesses/:businessId', requireAuth, requireRegisteredAccess('business', 'update'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const businessId = positiveIntegerId(req.params.businessId);
      const input = parseUpdateBusinessInput(req.body);
      if (businessId === null || !input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const business = await service.updateBusiness(context, businessId, input);
      res.status(200).json({ business });
    } catch (error) {
      handleError(error, res);
    }
  });

  return app;
};

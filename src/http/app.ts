import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { PostgresBusinessIdentityRepository } from '../resources/business-identity/repository';
import { BusinessIdentityServiceImpl } from '../resources/business-identity/service';
import { BusinessIdentityService, UpdateBusinessProfileInput } from '../resources/business-identity/contracts';
import { PostgresProjectRepository } from '../resources/project/repository';
import { ProjectServiceImpl } from '../resources/project/service';
import { CreateProjectInput, ProjectService, UpdateProjectInput } from '../resources/project/contracts';
import { isRegisteredOperation, ResourceOperation } from '../resources/registry';
import { config } from '../config';
import { PostgresPublicProjectRepository } from '../resources/project/public-repository';
import { PublicProjectServiceImpl } from '../resources/project/public-service';
import { PublicProjectService } from '../resources/project/public-contracts';

export interface AppDependencies {
  readonly businessIdentityService?: BusinessIdentityService;
  readonly projectService?: ProjectService;
  readonly publicProjectService?: PublicProjectService;
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

const requireRegisteredPublicAccess = (
  resource: Parameters<typeof canAccessResource>[1],
  operation: ResourceOperation,
) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    if (!isRegisteredOperation(resource, operation)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const routeParam = (value: string | string[]): string | null => typeof value === 'string' ? value : null;

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

const parseProjectCreateInput = (body: unknown): CreateProjectInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const input = body as Record<string, unknown>;
  const allowed = new Set([
    'title',
    'description',
    'category',
    'province',
    'city',
    'budgetMin',
    'budgetMax',
    'urgency',
  ]);

  if (Object.keys(input).some((key) => !allowed.has(key))) return null;

  const stringFields = ['title', 'description', 'category', 'province', 'city'];
  for (const field of stringFields) {
    if (typeof input[field] !== 'string') return null;
  }

  if (
    Object.hasOwn(input, 'budgetMin') &&
    input.budgetMin !== null &&
    typeof input.budgetMin !== 'number'
  ) return null;

  if (
    Object.hasOwn(input, 'budgetMax') &&
    input.budgetMax !== null &&
    typeof input.budgetMax !== 'number'
  ) return null;

  if (
    Object.hasOwn(input, 'urgency') &&
    input.urgency !== 'standard' &&
    input.urgency !== 'urgent' &&
    input.urgency !== 'emergency'
  ) return null;

  return {
    title: input.title as string,
    description: input.description as string,
    category: input.category as string,
    province: input.province as string,
    city: input.city as string,
    ...(Object.hasOwn(input, 'budgetMin')
      ? { budgetMin: input.budgetMin as number | null }
      : {}),
    ...(Object.hasOwn(input, 'budgetMax')
      ? { budgetMax: input.budgetMax as number | null }
      : {}),
    ...(Object.hasOwn(input, 'urgency')
      ? { urgency: input.urgency as CreateProjectInput['urgency'] }
      : {}),
  };
};

const parseProjectUpdateInput = (body: unknown): UpdateProjectInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const input = body as Record<string, unknown>;
  const allowed = new Set([
    'title',
    'description',
    'category',
    'province',
    'city',
    'budgetMin',
    'budgetMax',
    'urgency',
  ]);

  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) return null;

  const stringFields = ['title', 'description', 'category', 'province', 'city'];
  for (const field of stringFields) {
    if (Object.hasOwn(input, field) && typeof input[field] !== 'string') {
      return null;
    }
  }

  if (
    Object.hasOwn(input, 'budgetMin') &&
    input.budgetMin !== null &&
    typeof input.budgetMin !== 'number'
  ) return null;

  if (
    Object.hasOwn(input, 'budgetMax') &&
    input.budgetMax !== null &&
    typeof input.budgetMax !== 'number'
  ) return null;

  if (
    Object.hasOwn(input, 'urgency') &&
    input.urgency !== 'standard' &&
    input.urgency !== 'urgent' &&
    input.urgency !== 'emergency'
  ) return null;

  return input as UpdateProjectInput;
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Business creation requires a business operator role' || error.message === 'Business management permission required') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (error.message === 'Authenticated account not found' || error.message === 'Business not found' || error.message === 'Project not found or ownership required') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (error.message === 'Business creation requires no existing active business membership' || error.message === 'Only open Projects may be updated' || (error as { code?: string }).code === '23505') {
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
  const projectService = dependencies.projectService ?? new ProjectServiceImpl(new PostgresProjectRepository());
  const publicProjectService =
    dependencies.publicProjectService ??
    new PublicProjectServiceImpl(new PostgresPublicProjectRepository());
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

  app.get('/api/v1/businesses/slug/:slug', requireAuth, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const slugValue = routeParam(req.params.slug);
      const slug = slugValue?.trim();
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

  app.get('/api/v1/businesses/:businessId/managed', requireAuth, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const businessIdValue = routeParam(req.params.businessId);
      const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
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

  app.get('/api/v1/businesses/:businessId', requireAuth, requireRegisteredAccess('business', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const businessIdValue = routeParam(req.params.businessId);
      const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
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

  app.patch('/api/v1/businesses/:businessId', requireAuth, requireRegisteredAccess('business', 'update'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const businessIdValue = routeParam(req.params.businessId);
      const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
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

  app.post('/api/v1/projects', requireAuth, requireRegisteredAccess('project', 'create'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const input = parseProjectCreateInput(req.body);

      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const project = await projectService.createProject(context, input);
      res.status(201).json({ project });
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes(' is required') ||
        error.message.includes(' must be between ') ||
        error.message.includes('must be null or a non-negative number') ||
        error.message === 'budgetMax must be greater than or equal to budgetMin' ||
        error.message === 'Invalid Project urgency'
      )) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      handleError(error, res);
    }
  });


  app.get('/api/v1/public/projects/:projectId', requireRegisteredPublicAccess('project', 'readPublic'), async (req: Request, res: Response) => {
    try {
      const projectIdValue = routeParam(req.params.projectId);
      const projectId =
        projectIdValue === null ? null : positiveIntegerId(projectIdValue);

      if (projectId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const project = await publicProjectService.getPublicProject(projectId);

      if (!project) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      res.status(200).json({ project });
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid Project id') {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      handleError(error, res);
    }
  });

  app.get('/api/v1/projects/:projectId', requireAuth, requireRegisteredAccess('project', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const projectIdValue = routeParam(req.params.projectId);
      const projectId = projectIdValue === null ? null : positiveIntegerId(projectIdValue);

      if (projectId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const project = await projectService.getOwnedProject(context, projectId);

      if (!project) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      res.status(200).json({ project });
    } catch (error) {
      handleError(error, res);
    }
  });

  app.patch('/api/v1/projects/:projectId', requireAuth, requireRegisteredAccess('project', 'update'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const projectIdValue = routeParam(req.params.projectId);
      const projectId = projectIdValue === null ? null : positiveIntegerId(projectIdValue);
      const input = parseProjectUpdateInput(req.body);

      if (projectId === null || !input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const project = await projectService.updateOwnedProject(context, projectId, input);
      res.status(200).json({ project });
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes(' is required') ||
        error.message.includes(' must be between ') ||
        error.message.includes('must be null or a non-negative number') ||
        error.message === 'budgetMax must be greater than or equal to budgetMin' ||
        error.message === 'Invalid Project urgency' ||
        error.message === 'Project update requires at least one field' ||
        error.message.startsWith('Unsupported Project update field:')
      )) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      handleError(error, res);
    }
  });

  return app;
};

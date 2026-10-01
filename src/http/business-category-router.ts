import { Express, Request, Response, RequestHandler } from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import type { BusinessCategoryService } from '../resources/business-category/contracts';
import { isRegisteredOperation } from '../resources/registry';

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const uuidParam = (value: string | string[]): string | null => {
  const candidate = routeParam(value);
  return candidate !== null && UUID_RE.test(candidate) ? candidate : null;
};

const requireCategoryAccess = (
  resource: 'business_category' | 'business_category_assignment',
  operation: 'read' | 'create' | 'update',
) => (req: Request, res: Response, next: () => void): void => {
  const context = req.authContext as AuthContext | undefined;
  if (!context || !isRegisteredOperation(resource, operation) || !canAccessResource(context, resource)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Business access required' || error.message === 'Business management permission required') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (error.message === 'Category not found or not selectable' || error.message === 'Category assignment not found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (
      error.message === 'businessId must be a positive integer' ||
      error.message === 'categoryId must be a valid UUID' ||
      error.message === 'Category input is required' ||
      error.message === 'activeOnly must be boolean'
    ) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
  }
  console.error(JSON.stringify({ event: 'http_request_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  res.status(500).json({ error: 'internal_error' });
};

const parseActiveOnly = (value: unknown): boolean | undefined | null => {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
};

const parseCategoryBody = (body: unknown): { categoryId: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.categoryId !== 'string' || !UUID_RE.test(input.categoryId)) return null;
  return { categoryId: input.categoryId };
};

export const registerBusinessCategoryRoutes = (app: Express, businessCategoryService: BusinessCategoryService, authMiddleware: RequestHandler = requireAuth): void => {
  app.get('/api/v1/business-categories', requireAuth, requireCategoryAccess('business_category', 'read'), async (req: Request, res: Response) => {
    try {
      const activeOnly = parseActiveOnly(req.query.activeOnly);
      if (activeOnly === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const context = req.authContext as AuthContext;
      const categories = await businessCategoryService.listBusinessCategories(context, { activeOnly });
      res.status(200).json({ categories });
    } catch (error) { handleError(error, res); }
  });

  app.get('/api/v1/business-categories/:categoryId', requireAuth, requireCategoryAccess('business_category', 'read'), async (req: Request, res: Response) => {
    try {
      const categoryId = uuidParam(req.params.categoryId);
      if (categoryId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const context = req.authContext as AuthContext;
      const category = await businessCategoryService.getBusinessCategory(context, categoryId);
      if (!category) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ category });
    } catch (error) { handleError(error, res); }
  });

  app.get('/api/v1/businesses/:businessId/categories', requireAuth, requireCategoryAccess('business_category_assignment', 'read'), async (req: Request, res: Response) => {
    try {
      const businessIdValue = routeParam(req.params.businessId);
      const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
      if (businessId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const context = req.authContext as AuthContext;
      const assignments = await businessCategoryService.listBusinessCategoryAssignments(context, businessId);
      res.status(200).json({ assignments });
    } catch (error) { handleError(error, res); }
  });

  app.post('/api/v1/businesses/:businessId/categories', requireAuth, requireCategoryAccess('business_category_assignment', 'create'), async (req: Request, res: Response) => {
    try {
      const businessIdValue = routeParam(req.params.businessId);
      const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
      const body = parseCategoryBody(req.body);
      if (businessId === null || !body) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const context = req.authContext as AuthContext;
      const assignment = await businessCategoryService.assignBusinessCategory(context, { businessId, categoryId: body.categoryId });
      res.status(201).json({ assignment });
    } catch (error) { handleError(error, res); }
  });

  app.patch('/api/v1/businesses/:businessId/categories/:categoryId/primary', requireAuth, requireCategoryAccess('business_category_assignment', 'update'), async (req: Request, res: Response) => {
    try {
      const businessIdValue = routeParam(req.params.businessId);
      const businessId = businessIdValue === null ? null : positiveIntegerId(businessIdValue);
      const categoryId = uuidParam(req.params.categoryId);
      if (businessId === null || categoryId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const context = req.authContext as AuthContext;
      const assignment = await businessCategoryService.setPrimaryBusinessCategory(context, { businessId, categoryId });
      res.status(200).json({ assignment });
    } catch (error) { handleError(error, res); }
  });
};

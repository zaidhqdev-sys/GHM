import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization.js';
import { canAccessResource } from '../auth/authorization.js';
import { requireAuth } from '../auth/http.js';
import { isRegisteredOperation } from '../resources/registry.js';
import type {
  BusinessOfferingService,
  CreateBusinessOfferingInput,
  UpdateBusinessOfferingInput,
} from '../resources/business-offering/contracts.js';

const param = (value: string | string[]): string | null => typeof value === 'string' ? value : null;

const positiveId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const access = (
  operation: 'read' | 'readPublic' | 'create' | 'update',
  roles: readonly AuthContext['role'][],
) => (req: Request, res: Response, next: () => void): void => {
  const context = req.authContext as AuthContext | undefined;
  if (!context || !roles.includes(context.role) || !isRegisteredOperation('business_offering', operation) || !canAccessResource(context, 'business_offering')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const publicAccess = (res: Response): boolean => {
  if (!isRegisteredOperation('business_offering', 'readPublic')) {
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  return true;
};

const parseCreate = (body: unknown): CreateBusinessOfferingInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set([
    'businessId', 'offeringType', 'name', 'slug', 'description',
    'priceAmount', 'currencyCode', 'priceUnit', 'sortOrder',
  ]);
  if (Object.keys(input).some(key => !allowed.has(key))) return null;
  if (!Number.isSafeInteger(input.businessId) || Number(input.businessId) <= 0) return null;
  if (input.offeringType !== undefined && !['service', 'product', 'solution'].includes(input.offeringType as string)) return null;
  if (typeof input.name !== 'string' || typeof input.slug !== 'string') return null;
  if (input.description !== undefined && input.description !== null && typeof input.description !== 'string') return null;
  if (input.priceAmount !== undefined && input.priceAmount !== null && typeof input.priceAmount !== 'string') return null;
  if (input.currencyCode !== undefined && typeof input.currencyCode !== 'string') return null;
  if (input.priceUnit !== undefined && input.priceUnit !== null && typeof input.priceUnit !== 'string') return null;
  if (input.sortOrder !== undefined && (!Number.isSafeInteger(input.sortOrder) || Number(input.sortOrder) < 0)) return null;
  return input as unknown as CreateBusinessOfferingInput;
};

const parseUpdate = (body: unknown): UpdateBusinessOfferingInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set([
    'offeringType', 'name', 'slug', 'description', 'priceAmount',
    'currencyCode', 'priceUnit', 'isActive', 'sortOrder',
  ]);
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some(key => !allowed.has(key))) return null;
  if (input.offeringType !== undefined && !['service', 'product', 'solution'].includes(input.offeringType as string)) return null;
  if (input.name !== undefined && typeof input.name !== 'string') return null;
  if (input.slug !== undefined && typeof input.slug !== 'string') return null;
  if (input.description !== undefined && input.description !== null && typeof input.description !== 'string') return null;
  if (input.priceAmount !== undefined && input.priceAmount !== null && typeof input.priceAmount !== 'string') return null;
  if (input.currencyCode !== undefined && typeof input.currencyCode !== 'string') return null;
  if (input.priceUnit !== undefined && input.priceUnit !== null && typeof input.priceUnit !== 'string') return null;
  if (input.isActive !== undefined && typeof input.isActive !== 'boolean') return null;
  if (input.sortOrder !== undefined && (!Number.isSafeInteger(input.sortOrder) || Number(input.sortOrder) < 0)) return null;
  return input as unknown as UpdateBusinessOfferingInput;
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Business management permission required' || error.message === 'Business access required') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (error.message === 'Offering not found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (
      error.message.startsWith('Invalid ') ||
      error.message.includes('must be ') ||
      error.message.includes('must contain ') ||
      error.message.includes('Unsupported offering mutation') ||
      error.message === 'Business offering input is required' ||
      error.message === 'Offering update input is required'
    ) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
  }
  console.error(JSON.stringify({ event: 'http_request_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerBusinessOfferingRoutes = (
  app: Express,
  service: BusinessOfferingService,
  authMiddleware: RequestHandler = requireAuth,
): void => {
  app.get('/api/v1/public/businesses/:businessId/offerings', (_req, res) => {
    if (!publicAccess(res)) return;
    const value = param(_req.params.businessId);
    const businessId = value === null ? null : positiveId(value);
    if (businessId === null) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    void service.listPublicBusinessOfferings(businessId)
      .then(offerings => res.status(200).json({ offerings }))
      .catch(error => handleError(error, res));
  });

  app.get('/api/v1/businesses/:businessId/offerings', authMiddleware, access('read', ['admin', 'business']), async (req, res) => {
    try {
      const value = param(req.params.businessId);
      const businessId = value === null ? null : positiveId(value);
      if (businessId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const activeOnly = req.query.activeOnly;
      if (activeOnly !== undefined && activeOnly !== 'true' && activeOnly !== 'false') {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const offerings = await service.listBusinessOfferings(req.authContext as AuthContext, {
        businessId,
        ...(activeOnly !== undefined ? { activeOnly: activeOnly === 'true' } : {}),
      });
      res.status(200).json({ offerings });
    } catch (error) { handleError(error, res); }
  });

  app.get('/api/v1/businesses/:businessId/offerings/:slug', authMiddleware, access('read', ['admin', 'business']), async (req, res) => {
    try {
      const value = param(req.params.businessId);
      const businessId = value === null ? null : positiveId(value);
      const slug = param(req.params.slug);
      if (businessId === null || !slug) { res.status(400).json({ error: 'invalid_request' }); return; }
      const offering = await service.getBusinessOfferingBySlug(req.authContext as AuthContext, businessId, slug);
      if (!offering) { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ offering });
    } catch (error) { handleError(error, res); }
  });

  app.post('/api/v1/business-offerings', authMiddleware, access('create', ['admin', 'business']), async (req, res) => {
    try {
      const input = parseCreate(req.body);
      if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
      const offering = await service.createBusinessOffering(req.authContext as AuthContext, input);
      res.status(201).json({ offering });
    } catch (error) { handleError(error, res); }
  });

  app.patch('/api/v1/business-offerings/:offeringId', authMiddleware, access('update', ['admin', 'business']), async (req, res) => {
    try {
      const offeringId = param(req.params.offeringId);
      const input = parseUpdate(req.body);
      if (!offeringId || !input) { res.status(400).json({ error: 'invalid_request' }); return; }
      const offering = await service.updateBusinessOffering(req.authContext as AuthContext, offeringId, input);
      res.status(200).json({ offering });
    } catch (error) { handleError(error, res); }
  });
};

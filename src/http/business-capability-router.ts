import { Express, Request, Response , RequestHandler} from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import {  requireAuth , requireAuth } from '../auth/http';
import type { BusinessCapabilityService, CreateBusinessCapabilityInput } from '../resources/business-capability/contracts';
import { isRegisteredOperation } from '../resources/registry';

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseCreateInput = (body: unknown): CreateBusinessCapabilityInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set([
    'businessId',
    'capabilityId',
    'proficiencyLevel',
    'description',
    'effectiveFrom',
    'effectiveUntil',
    'sourceReference',
  ]);
  const keys = Object.keys(input);
  if (keys.some(key => !allowed.has(key))) return null;
  if (!Number.isSafeInteger(input.businessId) || (input.businessId as number) <= 0) return null;
  if (typeof input.capabilityId !== 'string' || !UUID_RE.test(input.capabilityId)) return null;
  if (
    Object.hasOwn(input, 'proficiencyLevel') &&
    input.proficiencyLevel !== null &&
    input.proficiencyLevel !== 'foundational' &&
    input.proficiencyLevel !== 'proficient' &&
    input.proficiencyLevel !== 'advanced' &&
    input.proficiencyLevel !== 'expert'
  ) return null;
  if (
    Object.hasOwn(input, 'description') &&
    input.description !== null &&
    typeof input.description !== 'string'
  ) return null;
  if (
    Object.hasOwn(input, 'sourceReference') &&
    input.sourceReference !== null &&
    typeof input.sourceReference !== 'string'
  ) return null;

  const parseDate = (value: unknown): Date | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const effectiveFrom = parseDate(input.effectiveFrom);
  const effectiveUntil = parseDate(input.effectiveUntil);
  if (effectiveFrom === null || effectiveUntil === null && input.effectiveUntil !== null && input.effectiveUntil !== undefined) {
    return null;
  }

  return {
    businessId: input.businessId as number,
    capabilityId: input.capabilityId as string,
    ...(Object.hasOwn(input, 'proficiencyLevel') ? { proficiencyLevel: input.proficiencyLevel as CreateBusinessCapabilityInput['proficiencyLevel'] } : {}),
    ...(Object.hasOwn(input, 'description') ? { description: input.description as string | null } : {}),
    ...(effectiveFrom !== undefined ? { effectiveFrom: effectiveFrom as Date } : {}),
    ...(Object.hasOwn(input, 'effectiveUntil') ? { effectiveUntil: effectiveUntil as Date | null } : {}),
    ...(Object.hasOwn(input, 'sourceReference') ? { sourceReference: input.sourceReference as string | null } : {}),
  };
};

const requireCapabilityAccess = (
  operation: 'read' | 'create',
) => (req: Request, res: Response, next: () => void): void => {
  const context = req.authContext as AuthContext | undefined;
  if (
    !context ||
    !isRegisteredOperation('business_capability', operation) ||
    !canAccessResource(context, 'business_capability')
  ) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (
      error.message === 'Business management permission required' ||
      error.message === 'Business access required' ||
      error.message === 'Capability not found or not selectable'
    ) {
      res.status(error.message === 'Capability not found or not selectable' ? 404 : 403).json({
        error: error.message === 'Capability not found or not selectable' ? 'not_found' : 'forbidden',
      });
      return;
    }
    if (
      error.message === 'businessId must be a positive integer' ||
      error.message === 'businessCapabilityId must be a positive integer' ||
      error.message === 'Business capability input is required' ||
      error.message === 'Capability ID must be a valid UUID' ||
      error.message === 'Invalid proficiency level' ||
      error.message === 'Description must contain between 1 and 1000 characters' ||
      error.message === 'Source reference must contain between 1 and 500 characters' ||
      error.message === 'Invalid effective-from date' ||
      error.message === 'Invalid effective-until date' ||
      error.message === 'Effective-until must be later than effective-from'
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

export const registerBusinessCapabilityRoutes = (
  app: Express,
  service: BusinessCapabilityService,
  authMiddleware: RequestHandler = requireAuth,
): void => {
  app.get(
    '/api/v1/business-capabilities',
    authMiddleware,
    requireCapabilityAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const value = typeof req.query.businessId === 'string' ? req.query.businessId : null;
        const businessId = value === null ? null : positiveIntegerId(value);
        if (businessId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const capabilities = await service.listBusinessCapabilities(context, businessId);
        res.status(200).json({ capabilities });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/business-capabilities/:businessCapabilityId',
    authMiddleware,
    requireCapabilityAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const value = routeParam(req.params.businessCapabilityId);
        const businessCapabilityId = value === null ? null : positiveIntegerId(value);
        if (businessCapabilityId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const capability = await service.getBusinessCapability(context, businessCapabilityId);
        if (!capability) {
          res.status(404).json({ error: 'not_found' });
          return;
        }
        res.status(200).json({ capability });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.post(
    '/api/v1/business-capabilities',
    authMiddleware,
    requireCapabilityAccess('create'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const input = parseCreateInput(req.body);
        if (!input) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const capability = await service.createBusinessCapability(context, input);
        res.status(201).json({ capability });
      } catch (error) {
        handleError(error, res);
      }
    },
  );
};

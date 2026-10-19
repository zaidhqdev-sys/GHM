import type { Express, Request, Response, RequestHandler } from 'express';
import { canAccessResource, type AuthContext } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation } from '../resources/registry';
import type {
  BusinessRegistrationIdentityService,
  UpdateBusinessRegistrationIdentityInput,
} from '../resources/business-registration-identity/contracts';

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const requireAccess = (operation: 'read' | 'update') =>
  (req: Request, res: Response, next: () => void): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context ||
        !isRegisteredOperation('business_registration_identity', operation) ||
        !canAccessResource(context, 'business_registration_identity')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const parseUpdateInput = (businessId: number, body: unknown): UpdateBusinessRegistrationIdentityInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['registrationStatus', 'registrationNumber', 'legalName']);
  const keys = Object.keys(input);
  if (keys.length !== allowed.size || keys.some(key => !allowed.has(key))) return null;
  if (input.registrationStatus !== null &&
      input.registrationStatus !== 'registered' &&
      input.registrationStatus !== 'unregistered') return null;
  if (input.registrationNumber !== null && typeof input.registrationNumber !== 'string') return null;
  if (input.legalName !== null && typeof input.legalName !== 'string') return null;
  return {
    businessId,
    registrationStatus: input.registrationStatus as UpdateBusinessRegistrationIdentityInput['registrationStatus'],
    registrationNumber: input.registrationNumber as string | null,
    legalName: input.legalName as string | null,
  };
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Business management permission required' || error.message === 'Business tenant access denied') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (
      error.message === 'businessId must be a positive integer' ||
      error.message === 'Business registration identity input is required' ||
      error.message === 'Registration status must be registered, unregistered, or null' ||
      error.message === 'Registration number must be text or null' ||
      error.message === 'Legal name must be text or null' ||
      error.message === 'Registration number must contain between 1 and 120 characters' ||
      error.message === 'Legal name must contain between 1 and 200 characters' ||
      error.message === 'Registration fields must be empty unless the Business is registered'
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

export const registerBusinessRegistrationIdentityRoutes = (
  app: Express,
  service: BusinessRegistrationIdentityService,
  authMiddleware: RequestHandler = requireAuth,
): void => {
  app.get(
    '/api/v1/businesses/:businessId/registration-identity',
    authMiddleware,
    requireAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const rawBusinessId = routeParam(req.params.businessId);
        const businessId = rawBusinessId === null ? null : positiveIntegerId(rawBusinessId);
        if (businessId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const registrationIdentity = await service.getRegistrationIdentity(context, businessId);
        res.status(200).json({ registrationIdentity });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.put(
    '/api/v1/businesses/:businessId/registration-identity',
    authMiddleware,
    requireAccess('update'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const rawBusinessId = routeParam(req.params.businessId);
        const businessId = rawBusinessId === null ? null : positiveIntegerId(rawBusinessId);
        const input = businessId === null ? null : parseUpdateInput(businessId, req.body);
        if (!input) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const registrationIdentity = await service.updateRegistrationIdentity(context, input);
        res.status(200).json({ registrationIdentity });
      } catch (error) {
        handleError(error, res);
      }
    },
  );
};

import type { Express, RequestHandler, Request, Response } from 'express';
import type { AuthContext } from '../auth/authorization';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';
import type {
  ActivateCommercialTrialInput,
  CommercialService,
  PrepareCommercialPaymentInput,
} from '../resources/commercial/contracts';

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const requireCommercialAccess =
  (operation: 'read' | 'create'): RequestHandler =>
  (req, res, next) => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('commercial', operation) || !canAccessResource(context, 'commercial')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const parseTrialInput = (body: unknown): ActivateCommercialTrialInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['businessId', 'planCode'].includes(key))) return null;
  if (!Number.isSafeInteger(input.businessId) || (input.businessId as number) <= 0) return null;
  if (typeof input.planCode !== 'string' || !input.planCode.trim()) return null;
  return { businessId: input.businessId as number, planCode: input.planCode };
};

const parsePaymentInput = (body: unknown): PrepareCommercialPaymentInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = ['businessId', 'countryId', 'idempotencyKey', 'expiresAt'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) return null;
  if (!Number.isSafeInteger(input.businessId) || (input.businessId as number) <= 0) return null;
  if (input.countryId !== undefined && input.countryId !== null && (!Number.isSafeInteger(input.countryId) || (input.countryId as number) <= 0)) return null;
  if (typeof input.idempotencyKey !== 'string' || !input.idempotencyKey.trim()) return null;
  if (input.expiresAt !== undefined && input.expiresAt !== null && typeof input.expiresAt !== 'string') return null;
  return {
    businessId: input.businessId as number,
    ...(input.countryId !== undefined ? { countryId: input.countryId as number | null } : {}),
    idempotencyKey: input.idempotencyKey,
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt as string) } : {}),
  };
};

const sendError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Business read permission required' || error.message === 'Business management permission required') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (error.message === 'Commercial subscription required' || error.message === 'Eligible commercial plan not found' || error.message === 'Eligible commercial price not found') {
      res.status(409).json({ error: 'conflict' });
      return;
    }
    if (error.message === 'Payment preparation idempotency conflict') {
      res.status(409).json({ error: 'idempotency_conflict' });
      return;
    }
  }
  res.status(400).json({ error: 'invalid_request' });
};

export const registerCommercialRoutes = (
  app: Express,
  service: CommercialService,
  resourceAuthMiddleware: RequestHandler,
): void => {
  app.get('/api/v1/commercial/access/:businessId', resourceAuthMiddleware, requireCommercialAccess('read'), async (req: Request, res: Response) => {
    const businessId = positiveIntegerId(req.params.businessId);
    const context = req.authContext as AuthContext | undefined;
    if (!businessId || !context) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      res.status(200).json({ result: await service.getCommercialAccess(context, businessId) });
    } catch (error) {
      sendError(error, res);
    }
  });

  app.get('/api/v1/commercial/subscription/:businessId', resourceAuthMiddleware, requireCommercialAccess('read'), async (req: Request, res: Response) => {
    const businessId = positiveIntegerId(req.params.businessId);
    const context = req.authContext as AuthContext | undefined;
    if (!businessId || !context) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      res.status(200).json({ result: await service.getCommercialSubscription(context, businessId) });
    } catch (error) {
      sendError(error, res);
    }
  });

  app.post('/api/v1/commercial/trial', resourceAuthMiddleware, requireCommercialAccess('create'), async (req: Request, res: Response) => {
    const context = req.authContext as AuthContext | undefined;
    const input = parseTrialInput(req.body);
    if (!context || !input) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      res.status(201).json({ result: await service.activateCommercialTrial(context, input) });
    } catch (error) {
      sendError(error, res);
    }
  });

  app.post('/api/v1/commercial/payment-attempts', resourceAuthMiddleware, requireCommercialAccess('create'), async (req: Request, res: Response) => {
    const context = req.authContext as AuthContext | undefined;
    const input = parsePaymentInput(req.body);
    if (!context || !input || (input.expiresAt && Number.isNaN(input.expiresAt.getTime()))) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      res.status(201).json({ result: await service.prepareCommercialPayment(context, input) });
    } catch (error) {
      sendError(error, res);
    }
  });
};

import { Express, Request, Response , RequestHandler} from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import {  requireAuth , requireAuth } from '../auth/http';
import type {
  CreateSupportRequestInput,
  ListSupportRequestsOptions,
  SupportRequestCategory,
  SupportRequestService,
  SupportRequestStatus,
} from '../resources/support-request/contracts';
import { isRegisteredOperation } from '../resources/registry';

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const CATEGORIES = new Set<SupportRequestCategory>([
  'account', 'business', 'directory', 'marketplace', 'workspace',
  'trial_and_commercial', 'technical', 'other',
]);
const STATUSES = new Set<SupportRequestStatus>(['open', 'in_progress', 'resolved', 'closed']);

const requireSupportAccess = (
  operation: 'read' | 'create' | 'updateStatus' | 'readMessages' | 'replyAsCustomer' | 'replyAsAdmin',
  roles?: readonly AuthContext['role'][],
) => (req: Request, res: Response, next: () => void): void => {
  const context = req.authContext as AuthContext | undefined;
  if (
    !context ||
    (roles && !roles.includes(context.role)) ||
    !isRegisteredOperation('support_request', operation) ||
    !canAccessResource(context, 'support_request')
  ) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const parseCreateInput = (body: unknown): CreateSupportRequestInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['businessId', 'category', 'subject', 'description']);
  if (Object.keys(input).some((key) => !allowed.has(key))) return null;
  if (typeof input.category !== 'string' || !CATEGORIES.has(input.category as SupportRequestCategory)) return null;
  if (typeof input.subject !== 'string' || typeof input.description !== 'string') return null;
  if (Object.hasOwn(input, 'businessId') && input.businessId !== null &&
      (!Number.isSafeInteger(input.businessId) || (input.businessId as number) <= 0)) return null;
  return {
    category: input.category as SupportRequestCategory,
    subject: input.subject,
    description: input.description,
    ...(Object.hasOwn(input, 'businessId') ? { businessId: input.businessId as number | null } : {}),
  };
};

const parseStatusInput = (body: unknown): { status: SupportRequestStatus; resolutionSummary?: string | null } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['status', 'resolutionSummary']);
  if (Object.keys(input).some((key) => !allowed.has(key)) || typeof input.status !== 'string' ||
      !STATUSES.has(input.status as SupportRequestStatus)) return null;
  if (Object.hasOwn(input, 'resolutionSummary') &&
      input.resolutionSummary !== null && typeof input.resolutionSummary !== 'string') return null;
  return {
    status: input.status as SupportRequestStatus,
    ...(Object.hasOwn(input, 'resolutionSummary')
      ? { resolutionSummary: input.resolutionSummary as string | null }
      : {}),
  };
};

const parseReplyBody = (body: unknown): string | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.body !== 'string') return null;
  return input.body;
};

const parseListOptions = (query: Request['query']): ListSupportRequestsOptions | null => {
  const options = {} as { status?: SupportRequestStatus; limit?: number };
  if (query.status !== undefined) {
    if (typeof query.status !== 'string' || !STATUSES.has(query.status as SupportRequestStatus)) return null;
    options.status = query.status as SupportRequestStatus;
  }
  if (query.limit !== undefined) {
    if (typeof query.limit !== 'string' || !/^[1-9]\d*$/.test(query.limit)) return null;
    const limit = Number(query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return null;
    options.limit = limit;
  }
  return options;
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Support Request not found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (error.message === 'Insufficient role' || error.message === 'Business membership required') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (
      error.message.includes('Invalid Support Request') ||
      error.message.includes(' must be between ') ||
      error.message.includes(' is required') ||
      error.message.includes('Invalid requestId') ||
      error.message.includes('Invalid businessId') ||
      error.message.includes('Invalid Support Request limit') ||
      error.message.includes('Resolution summary is only valid')
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

export const registerSupportRequestRoutes = (
  app: Express,
  service: SupportRequestService,
): void => {
  app.get(
    '/api/v1/support-requests',
    authMiddleware,
    requireSupportAccess('read', ['customer', 'admin']),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const options = parseListOptions(req.query);
        if (!options) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const supportRequests = await service.listSupportRequests(context, options);
        res.status(200).json({ supportRequests });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/support-requests/:requestId',
    authMiddleware,
    requireSupportAccess('read', ['customer', 'admin']),
    async (req: Request, res: Response) => {
      try {
        const value = routeParam(req.params.requestId);
        const requestId = value === null ? null : positiveIntegerId(value);
        if (requestId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const supportRequest = await service.getSupportRequest(
          req.authContext as AuthContext,
          requestId,
        );
        if (!supportRequest) {
          res.status(404).json({ error: 'not_found' });
          return;
        }
        res.status(200).json({ supportRequest });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.post(
    '/api/v1/support-requests',
    authMiddleware,
    requireSupportAccess('create', ['customer']),
    async (req: Request, res: Response) => {
      try {
        const input = parseCreateInput(req.body);
        if (!input) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const supportRequest = await service.createSupportRequest(req.authContext as AuthContext, input);
        res.status(201).json({ supportRequest });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.patch(
    '/api/v1/support-requests/:requestId/status',
    authMiddleware,
    requireSupportAccess('updateStatus', ['admin']),
    async (req: Request, res: Response) => {
      try {
        const value = routeParam(req.params.requestId);
        const requestId = value === null ? null : positiveIntegerId(value);
        const input = parseStatusInput(req.body);
        if (requestId === null || !input) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const supportRequest = await service.updateSupportRequestStatus(
          req.authContext as AuthContext,
          requestId,
          input,
        );
        res.status(200).json({ supportRequest });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/support-requests/:requestId/messages',
    authMiddleware,
    requireSupportAccess('readMessages', ['customer', 'admin']),
    async (req: Request, res: Response) => {
      try {
        const value = routeParam(req.params.requestId);
        const requestId = value === null ? null : positiveIntegerId(value);
        if (requestId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const messages = await service.getMessages(req.authContext as AuthContext, requestId);
        res.status(200).json({ messages });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.post(
    '/api/v1/support-requests/:requestId/messages',
    authMiddleware,
    (req: Request, res: Response, next: () => void) => {
      const context = req.authContext as AuthContext | undefined;
      const operation = context?.role === 'admin' ? 'replyAsAdmin' : 'replyAsCustomer';
      requireSupportAccess(operation, ['admin', 'customer'])(req, res, next);
    },
    async (req: Request, res: Response) => {
      try {
        const value = routeParam(req.params.requestId);
        const requestId = value === null ? null : positiveIntegerId(value);
        const body = parseReplyBody(req.body);
        if (requestId === null || body === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const context = req.authContext as AuthContext;
        const message = context.role === 'admin'
          ? await service.replyAsAdmin(context, requestId, body)
          : await service.replyAsCustomer(context, requestId, body);
        res.status(201).json({ message });
      } catch (error) {
        handleError(error, res);
      }
    },
  );
};

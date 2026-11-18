import type { Express, Request, RequestHandler, Response } from 'express';
import { canAccessResource, type AuthContext } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation, type ResourceOperation } from '../resources/registry';
import {
  parseCreateTracking, parseListQuery, parsePathId, parseUpdateTracking,
} from '../tender/tracking-contract';
import { TenderTrackingGatewayError, type TenderTrackingGatewayClient } from './tender-tracking-gateway-client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const base = '/api/v1/businesses/:businessId/tenders/tracking';

const access = (operation: ResourceOperation): RequestHandler => (req, res, next): void => {
  const context = req.authContext as AuthContext | undefined;
  if (!context || !isRegisteredOperation('tender_tracking', operation) || !canAccessResource(context, 'tender_tracking')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const bearer = (req: Request): string | null => {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token || null;
};

const correlation = (req: Request): string | null => {
  const raw = req.header('x-request-id');
  return raw && UUID.test(raw) ? raw.toLowerCase() : null;
};

/**
 * Tender tracking exists ONLY behind the Actor Gateway: there is no direct-database path
 * and no fallback. Without a configured Gateway client every route answers 503. The
 * router never supplies an actor, account, business role or membership to the Gateway;
 * it forwards the caller's own bearer token and the path Business id, nothing else.
 */
export const registerTenderTrackingRoutes = (
  app: Express,
  gatewayClient: TenderTrackingGatewayClient | undefined,
  authMiddleware: RequestHandler = requireAuth,
): void => {
  const fail = (error: unknown, res: Response): void => {
    if (error instanceof TenderTrackingGatewayError) {
      const map: Record<number, [number, string]> = {
        400: [400, 'invalid_request'], 401: [401, 'unauthorized'], 403: [403, 'forbidden'],
        404: [404, 'not_found'], 409: [409, 'conflict'], 429: [429, 'rate_limited'],
      };
      const hit = map[error.status];
      if (hit) { res.status(hit[0]).json({ error: hit[1] }); return; }
    }
    console.error(JSON.stringify({
      event: 'tender_tracking_gateway_failed',
      error: { name: error instanceof Error ? error.name : 'UnknownError' },
    }));
    res.status(503).json({ error: 'service_unavailable' });
  };

  const guarded = (
    operation: ResourceOperation,
    run: (client: TenderTrackingGatewayClient, a: { token: string; businessId: number; req: Request }) => Promise<{ status: number; body: unknown } | null>,
  ): RequestHandler[] => [
    authMiddleware,
    access(operation),
    async (req: Request, res: Response): Promise<void> => {
      const token = bearer(req);
      if (!token) { res.status(401).json({ error: 'unauthorized' }); return; }
      if (!gatewayClient) { res.status(503).json({ error: 'service_unavailable' }); return; }
      const businessId = parsePathId(req.params.businessId);
      if (businessId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      try {
        const out = await run(gatewayClient, { token, businessId, req });
        if (!out) { res.status(400).json({ error: 'invalid_request' }); return; }
        res.status(out.status).json(out.body);
      } catch (error) {
        fail(error, res);
      }
    },
  ];

  app.post(base, ...guarded('create', async (c, { token, businessId, req }) => {
    const input = parseCreateTracking(req.body);
    if (!input.ok) return null;
    return { status: 201, body: { tracking: await c.create(token, businessId, input.value, correlation(req)) } };
  }));
  app.get(base, ...guarded('read', async (c, { token, businessId, req }) => {
    const q = parseListQuery(req.query);
    if (!q.ok) return null;
    return { status: 200, body: await c.list(token, businessId, q.value, correlation(req)) };
  }));
  app.get(`${base}/:id`, ...guarded('read', async (c, { token, businessId, req }) => {
    const id = parsePathId(req.params.id);
    if (id === null) return null;
    return { status: 200, body: { tracking: await c.get(token, businessId, id, correlation(req)) } };
  }));
  app.patch(`${base}/:id`, ...guarded('update', async (c, { token, businessId, req }) => {
    const id = parsePathId(req.params.id);
    const patch = parseUpdateTracking(req.body);
    if (id === null || !patch.ok) return null;
    return { status: 200, body: { tracking: await c.update(token, businessId, id, patch.value, correlation(req)) } };
  }));
  app.post(`${base}/:id/archive`, ...guarded('archive', async (c, { token, businessId, req }) => {
    const id = parsePathId(req.params.id);
    const empty = req.body === undefined || (typeof req.body === 'object' && req.body !== null && Object.keys(req.body).length === 0);
    if (id === null || !empty) return null;
    return { status: 200, body: { tracking: await c.archive(token, businessId, id, correlation(req)) } };
  }));
  app.delete(`${base}/:id`, ...guarded('delete', async (c, { token, businessId, req }) => {
    const id = parsePathId(req.params.id);
    if (id === null) return null;
    return { status: 200, body: { deleted: await c.remove(token, businessId, id, correlation(req)) } };
  }));
};

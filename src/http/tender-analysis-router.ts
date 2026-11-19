import type { Express, Request, RequestHandler, Response } from 'express';
import { canAccessResource, type AuthContext } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation, type ResourceOperation } from '../resources/registry';
import { parseAnalysisListQuery, parseCreateAnalysis } from '../tender/analysis-contract';
import { parsePathId } from '../tender/tracking-contract';
import { TenderAnalysisGatewayError, type TenderAnalysisGatewayClient } from './tender-analysis-gateway-client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const base = '/api/v1/businesses/:businessId/tenders/analyses';

const access = (operation: ResourceOperation): RequestHandler => (req, res, next): void => {
  const context = req.authContext as AuthContext | undefined;
  if (!context || !isRegisteredOperation('tender_analysis', operation) || !canAccessResource(context, 'tender_analysis')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const bearer = (req: Request): string | null => {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice(7).trim() || null;
};
const correlation = (req: Request): string | null => {
  const raw = req.header('x-request-id');
  return raw && UUID.test(raw) ? raw.toLowerCase() : null;
};

/**
 * Saved analyses exist ONLY behind the Actor Gateway. There is no direct-database path and no
 * fallback: without a configured Gateway client every route answers 503. Writes are validated
 * here (additional) and again by the Gateway (authoritative) with the same version-2 contract.
 * Unsupported analyses are refused (422) and never stored.
 */
export const registerTenderAnalysisRoutes = (
  app: Express,
  gatewayClient: TenderAnalysisGatewayClient | undefined,
  authMiddleware: RequestHandler = requireAuth,
): void => {
  const fail = (error: unknown, res: Response): void => {
    if (error instanceof TenderAnalysisGatewayError) {
      const map: Record<number, [number, string]> = {
        400: [400, 'invalid_request'], 401: [401, 'unauthorized'], 403: [403, 'forbidden'],
        404: [404, 'not_found'], 409: [409, 'conflict'], 413: [413, 'payload_too_large'],
        422: [422, 'unsupported'], 429: [429, 'rate_limited'],
      };
      const hit = map[error.status];
      if (hit) { res.status(hit[0]).json({ error: hit[1] }); return; }
    }
    console.error(JSON.stringify({
      event: 'tender_analysis_gateway_failed',
      error: { name: error instanceof Error ? error.name : 'UnknownError' },
    }));
    res.status(503).json({ error: 'service_unavailable' });
  };

  type Done = { status: number; body: unknown } | { refusal: 'invalid' | 'too_large' | 'unsupported' };
  const guarded = (
    operation: ResourceOperation,
    run: (client: TenderAnalysisGatewayClient, a: { token: string; businessId: number; req: Request }) => Promise<Done>,
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
        if ('refusal' in out) {
          if (out.refusal === 'too_large') res.status(413).json({ error: 'payload_too_large' });
          else if (out.refusal === 'unsupported') res.status(422).json({ error: 'unsupported' });
          else res.status(400).json({ error: 'invalid_request' });
          return;
        }
        res.status(out.status).json(out.body);
      } catch (error) {
        fail(error, res);
      }
    },
  ];

  app.post(base, ...guarded('create', async (c, { token, businessId, req }) => {
    const input = parseCreateAnalysis(req.body);
    if (!input.ok) return { refusal: input.reason };
    return { status: 201, body: { analysis: await c.create(token, businessId, input.value, correlation(req)) } };
  }));
  app.get(base, ...guarded('read', async (c, { token, businessId, req }) => {
    const q = parseAnalysisListQuery(req.query);
    if (!q.ok) return { refusal: 'invalid' };
    return { status: 200, body: await c.list(token, businessId, q.value, correlation(req)) };
  }));
  app.get(`${base}/:id`, ...guarded('read', async (c, { token, businessId, req }) => {
    const id = parsePathId(req.params.id);
    if (id === null) return { refusal: 'invalid' };
    return { status: 200, body: { analysis: await c.get(token, businessId, id, correlation(req)) } };
  }));
  app.delete(`${base}/:id`, ...guarded('delete', async (c, { token, businessId, req }) => {
    const id = parsePathId(req.params.id);
    if (id === null) return { refusal: 'invalid' };
    return { status: 200, body: { deleted: await c.remove(token, businessId, id, correlation(req)) } };
  }));
};

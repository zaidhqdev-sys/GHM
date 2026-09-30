import { Express, Request, Response } from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation } from '../resources/registry';
import type { CreateProjectQuoteInput, ProjectQuoteService, UpdateProjectQuoteInput } from '../resources/project-quote/contracts';

const param = (v: string | string[]) => typeof v === 'string' ? v : null;
const id = (v: string) => /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null;

const access = (
  operation: 'readReceived' | 'readOwn' | 'create' | 'update' | 'accept' | 'reject',
  roles: readonly AuthContext['role'][],
) => (req: Request, res: Response, next: () => void): void => {
  const context = req.authContext as AuthContext | undefined;
  if (!context || !roles.includes(context.role) || !isRegisteredOperation('project_quote', operation) || !canAccessResource(context, 'project_quote')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const parseCreate = (body: unknown): CreateProjectQuoteInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const x = body as Record<string, unknown>;
  const allowed = new Set([
    'projectId','businessId','amount','labourMin','labourMax','materialsMin','materialsMax',
    'totalMin','totalMax','durationDays','description',
  ]);
  if (Object.keys(x).some(k => !allowed.has(k))) return null;
  if (!Number.isSafeInteger(x.projectId) || Number(x.projectId) <= 0) return null;
  if (!Number.isSafeInteger(x.businessId) || Number(x.businessId) <= 0) return null;
  if (typeof x.amount !== 'number' || !Number.isFinite(x.amount)) return null;
  for (const key of ['labourMin','labourMax','materialsMin','materialsMax','totalMin','totalMax']) {
    if (Object.hasOwn(x, key) && x[key] !== null && (typeof x[key] !== 'number' || !Number.isFinite(x[key] as number))) return null;
  }
  if (Object.hasOwn(x, 'durationDays') && x.durationDays !== null && (!Number.isSafeInteger(x.durationDays) || Number(x.durationDays) < 1)) return null;
  if (Object.hasOwn(x, 'description') && x.description !== null && typeof x.description !== 'string') return null;
  return x as CreateProjectQuoteInput;
};

const parseUpdate = (body: unknown): UpdateProjectQuoteInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const x = body as Record<string, unknown>;
  const allowed = new Set(['amount','labourMin','labourMax','materialsMin','materialsMax','totalMin','totalMax','durationDays','description']);
  if (Object.keys(x).length === 0 || Object.keys(x).some(k => !allowed.has(k))) return null;
  if (Object.hasOwn(x, 'amount') && (typeof x.amount !== 'number' || !Number.isFinite(x.amount))) return null;
  for (const key of ['labourMin','labourMax','materialsMin','materialsMax','totalMin','totalMax']) {
    if (Object.hasOwn(x, key) && x[key] !== null && (typeof x[key] !== 'number' || !Number.isFinite(x[key] as number))) return null;
  }
  if (Object.hasOwn(x, 'durationDays') && x.durationDays !== null && !Number.isSafeInteger(x.durationDays)) return null;
  if (Object.hasOwn(x, 'description') && x.description !== null && typeof x.description !== 'string') return null;
  return x as UpdateProjectQuoteInput;
};

const error = (e: unknown, res: Response): void => {
  if (e instanceof Error) {
    if (e.message.includes('ownership denied') || e.message.includes('access denied') || e.message.includes('ownership required') || e.message.includes('not eligible')) {
      res.status(403).json({ error: 'forbidden' }); return;
    }
    if (e.message.includes('not found') || e.message.includes('was not found') || e.message.includes('not editable')) {
      res.status(404).json({ error: 'not_found' }); return;
    }
    if (e.message.includes('Invalid ') || e.message.includes('must be') || e.message.includes('cannot be') || e.message.includes('requires at least one') || e.message.includes('Unsupported')) {
      res.status(400).json({ error: 'invalid_request' }); return;
    }
    if (e.message.includes('Only open Projects') || e.message.includes('Project is not open')) {
      res.status(409).json({ error: 'conflict' }); return;
    }
  }
  console.error(JSON.stringify({ event: 'http_request_failed', error: { name: e instanceof Error ? e.name : 'UnknownError' } }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerProjectQuoteRoutes = (app: Express, service: ProjectQuoteService): void => {
  app.get('/api/v1/projects/:projectId/quotes', requireAuth, access('readReceived', ['customer']), async (req, res) => {
    try {
      const v = param(req.params.projectId); const projectId = v === null ? null : id(v);
      if (projectId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      res.status(200).json({ quotes: await service.readReceived(req.authContext as AuthContext, projectId) });
    } catch (e) { error(e, res); }
  });

  app.get('/api/v1/businesses/:businessId/project-quotes', requireAuth, access('readOwn', ['business']), async (req, res) => {
    try {
      const v = param(req.params.businessId); const businessId = v === null ? null : id(v);
      if (businessId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      res.status(200).json({ quotes: await service.readOwn(req.authContext as AuthContext, businessId) });
    } catch (e) { error(e, res); }
  });

  app.post('/api/v1/project-quotes', requireAuth, access('create', ['business']), async (req, res) => {
    try {
      const input = parseCreate(req.body);
      if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
      res.status(201).json({ quote: await service.create(req.authContext as AuthContext, input) });
    } catch (e) { error(e, res); }
  });

  app.patch('/api/v1/project-quotes/:quoteId', requireAuth, access('update', ['business']), async (req, res) => {
    try {
      const v = param(req.params.quoteId); const quoteId = v === null ? null : id(v);
      const input = parseUpdate(req.body);
      if (quoteId === null || !input) { res.status(400).json({ error: 'invalid_request' }); return; }
      res.status(200).json({ quote: await service.update(req.authContext as AuthContext, quoteId, input) });
    } catch (e) { error(e, res); }
  });

  app.post('/api/v1/project-quotes/:quoteId/accept', requireAuth, access('accept', ['customer']), async (req, res) => {
    try {
      const v = param(req.params.quoteId); const quoteId = v === null ? null : id(v);
      if (quoteId === null || Object.keys(req.body ?? {}).length !== 0) { res.status(400).json({ error: 'invalid_request' }); return; }
            res.status(200).json({ quote: await service.accept(req.authContext as AuthContext, quoteId) });
    } catch (e) { error(e, res); }
  });

  app.post('/api/v1/project-quotes/:quoteId/reject', requireAuth, access('reject', ['customer']), async (req, res) => {
    try {
      const v = param(req.params.quoteId); const quoteId = v === null ? null : id(v);
      if (quoteId === null || Object.keys(req.body ?? {}).length !== 0) { res.status(400).json({ error: 'invalid_request' }); return; }
            res.status(200).json({ quote: await service.reject(req.authContext as AuthContext, quoteId) });
    } catch (e) { error(e, res); }
  });
};

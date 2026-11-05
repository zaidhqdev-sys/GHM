import type { Express, Request, Response, RequestHandler } from 'express';
import { canAccessResource, type AuthContext } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation } from '../resources/registry';
import type { DirectoryReviewDecision, DirectoryReviewService, DirectoryReviewStatus } from '../resources/directory-review/contracts';

const routeParam = (value: string | string[]): string | null => typeof value === 'string' ? value : null;
const positiveId = (value: string): number | null => {
  if (!/^[1-9]\\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};
const requireAccess = (operation: 'read' | 'create' | 'transition') =>
  (req: Request, res: Response, next: () => void): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('directory_review', operation) || !canAccessResource(context, 'directory_review')) {
      res.status(403).json({ error: 'forbidden' }); return;
    }
    next();
  };
const statusValues: readonly DirectoryReviewStatus[] = ['under_review','information_requested','rejected','approved','unverified'];

export const registerDirectoryReviewRoutes = (app: Express, service: DirectoryReviewService, auth: RequestHandler = requireAuth): void => {
  app.post('/api/v1/businesses/:businessId/directory-review', auth, requireAccess('create'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const raw = routeParam(req.params.businessId);
      const id = raw === null ? null : positiveId(raw);
      if (id === null || Object.keys(req.body ?? {}).length !== 0) { res.status(400).json({ error: 'invalid_request' }); return; }
      const review = await service.submit(context, id);
      res.status(200).json({ review });
    } catch (error) { handleError(error, res); }
  });

  app.get('/api/v1/admin/directory-reviews', auth, requireAccess('read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const allowed = new Set(['status','limit','offset']);
      if (Object.keys(req.query).some(key => !allowed.has(key))) { res.status(400).json({ error: 'invalid_request' }); return; }
      const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'under_review';
      const status = statusRaw === 'all' ? null : statusValues.includes(statusRaw as DirectoryReviewStatus) ? statusRaw as DirectoryReviewStatus : undefined;
      const limitRaw = typeof req.query.limit === 'string' ? req.query.limit : '20';
      const offsetRaw = typeof req.query.offset === 'string' ? req.query.offset : '0';
      if (status === undefined || !/^\\d+$/.test(limitRaw) || !/^\\d+$/.test(offsetRaw)) { res.status(400).json({ error: 'invalid_request' }); return; }
      const businesses = await service.list(context, { status, limit: Number(limitRaw), offset: Number(offsetRaw) });
      res.status(200).json({ businesses });
    } catch (error) { handleError(error, res); }
  });

  app.patch('/api/v1/admin/directory-reviews/:businessId', auth, requireAccess('transition'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const raw = routeParam(req.params.businessId);
      const id = raw === null ? null : positiveId(raw);
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
      if (id === null || Object.keys(body).some(k => !['decision','reason'].includes(k)) ||
          (body.decision !== 'approve' && body.decision !== 'reject' && body.decision !== 'request_information') ||
          (body.reason !== undefined && body.reason !== null && typeof body.reason !== 'string')) {
        res.status(400).json({ error: 'invalid_request' }); return;
      }
      const review = await service.review(context, id, body.decision as DirectoryReviewDecision, (body.reason as string | null | undefined) ?? null);
      res.status(200).json({ review });
    } catch (error) { handleError(error, res); }
  });

  app.get('/api/v1/businesses/:businessId/directory-review-presentation', auth, requireAccess('read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const raw = routeParam(req.params.businessId);
      const id = raw === null ? null : positiveId(raw);
      if (id === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const review = await service.getPresentation(context, id);
      res.status(200).json({ review });
    } catch (error) { handleError(error, res); }
  });
};

function handleError(error: unknown, res: Response): void {
  const message = error instanceof Error ? error.message : '';
  if (/Founder directory review authority|required reviewer authority is not configured/i.test(message)) {
    res.status(403).json({ error: 'forbidden' }); return;
  }
  if (/Business management permission required|Business tenant access denied|Business not found|presentation not found/i.test(message)) {
    res.status(404).json({ error: 'not_found' }); return;
  }
  if (/invalid|must be|reason|cannot be submitted|Only businesses under review|registration declaration/i.test(message)) {
    res.status(400).json({ error: 'invalid_request' }); return;
  }
  console.error(JSON.stringify({ event: 'http_request_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  res.status(500).json({ error: 'internal_error' });
}

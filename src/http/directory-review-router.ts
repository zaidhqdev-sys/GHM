import type { Express, Request, Response, RequestHandler } from 'express';
import { canAccessResource, type AuthContext } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation } from '../resources/registry';
import type { DirectoryReviewService } from '../resources/directory-review/contracts';

const routeParam = (value: string | string[]): string | null => typeof value === 'string' ? value : null;
const positiveId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const requireReadAccess = (req: Request, res: Response, next: () => void): void => {
  const context = req.authContext as AuthContext | undefined;
  if (!context || !isRegisteredOperation('directory_review', 'read') || !canAccessResource(context, 'directory_review')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const founderReviewDisabled = (_req: Request, res: Response): void => {
  res.status(403).json({ error: 'forbidden' });
};

export const registerDirectoryReviewRoutes = (
  app: Express,
  service: DirectoryReviewService,
  auth: RequestHandler = requireAuth,
): void => {
  app.get('/api/v1/admin/directory-reviews/authority', auth, requireReadAccess, async (_req: Request, res: Response) => {
    res.status(200).json({ isFounderReviewer: false });
  });

  // Founder review was explicitly disabled by migration 20261109140000.
  // Keep the legacy endpoints deterministic, but never invoke the revoked
  // submit/list/review SECURITY DEFINER functions from the shared runtime.
  app.post('/api/v1/businesses/:businessId/directory-review', auth, founderReviewDisabled);
  app.get('/api/v1/admin/directory-reviews', auth, founderReviewDisabled);
  app.patch('/api/v1/admin/directory-reviews/:businessId', auth, founderReviewDisabled);

  // Business owners/administrators may still read their own review presentation.
  app.get('/api/v1/businesses/:businessId/directory-review-presentation', auth, requireReadAccess, async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const raw = routeParam(req.params.businessId);
      const id = raw === null ? null : positiveId(raw);
      if (id === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const review = await service.getPresentation(context, id);
      res.status(200).json({ review });
    } catch (error) {
      handleError(error, res);
    }
  });
};

function handleError(error: unknown, res: Response): void {
  const message = error instanceof Error ? error.message : '';
  if (/Founder directory review authority|required reviewer authority is not configured/i.test(message)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  if (/Business management permission required|Business tenant access denied|Business not found|presentation not found/i.test(message)) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (/invalid|must be|reason|cannot be submitted|Only businesses under review|registration declaration/i.test(message)) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  console.error(JSON.stringify({ event: 'http_request_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  res.status(500).json({ error: 'internal_error' });
}

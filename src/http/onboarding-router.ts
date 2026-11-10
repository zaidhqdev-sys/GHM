import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';
import type { OnboardingProgressService } from '../resources/onboarding/contracts';

const JOURNEY_PATTERN = /^[a-z][a-z0-9_]{2,79}_v[1-9][0-9]*$/;
const STEP_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;

const requireOnboardingAccess = (operation: 'read' | 'create' | 'update'): RequestHandler =>
  (req, res, next) => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('onboarding', operation) || !canAccessResource(context, 'onboarding')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const parseBody = (body: unknown): { journeyId: string; stepId: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 2 || typeof input.journeyId !== 'string' || typeof input.stepId !== 'string') return null;
  const journeyId = input.journeyId.trim();
  const stepId = input.stepId.trim();
  if (!JOURNEY_PATTERN.test(journeyId) || !STEP_PATTERN.test(stepId)) return null;
  return { journeyId, stepId };
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error && error.message.startsWith('Invalid onboarding ')) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  console.error(JSON.stringify({
    event: 'onboarding_progress_failed',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerOnboardingRoutes = (
  app: Express,
  service: OnboardingProgressService,
  authMiddleware: RequestHandler,
): void => {
  app.get('/api/v1/onboarding/progress', authMiddleware, requireOnboardingAccess('read'), async (req: Request, res: Response) => {
    const context = req.authContext as AuthContext;
    const journeyId = req.query.journeyId;
    if (Object.keys(req.query).some(key => key !== 'journeyId')
      || (journeyId !== undefined && (typeof journeyId !== 'string' || !JOURNEY_PATTERN.test(journeyId.trim())))) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    try {
      const progress = await service.getProgress(context, typeof journeyId === 'string' ? journeyId.trim() : null);
      res.status(200).json({ progress });
    } catch (error) {
      handleError(error, res);
    }
  });

  const registerMutation = (
    action: 'start' | 'complete' | 'dismiss',
    operation: 'create' | 'update',
    status: number,
  ): void => {
    app.post(`/api/v1/onboarding/progress/${action}`, authMiddleware, requireOnboardingAccess(operation), async (req: Request, res: Response) => {
      const context = req.authContext as AuthContext;
      const input = parseBody(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      try {
        const progress = await service[action](context, input.journeyId, input.stepId);
        res.status(status).json({ progress });
      } catch (error) {
        handleError(error, res);
      }
    });
  };

  registerMutation('start', 'create', 200);
  registerMutation('complete', 'update', 200);
  registerMutation('dismiss', 'update', 200);
};

import { Express, Request, Response , RequestHandler} from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import {  requireAuth , requireAuth } from '../auth/http';
import type { TrustLevel, TrustScoreService } from '../resources/trust-score/contracts';
import { isRegisteredOperation } from '../resources/registry';

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const TRUST_LEVELS = new Set<TrustLevel>(['bronze', 'silver', 'gold', 'platinum']);

const trustLevelParam = (value: unknown): TrustLevel | null =>
  typeof value === 'string' && TRUST_LEVELS.has(value as TrustLevel)
    ? value as TrustLevel
    : null;

const requireTrustScoreAccess = (
  operation: 'read' | 'calculate',
) => (req: Request, res: Response, next: () => void): void => {
  const context = req.authContext as AuthContext | undefined;
  if (
    !context ||
    !isRegisteredOperation('trust_score', operation) ||
    !canAccessResource(context, 'trust_score')
  ) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const requireTrustScorePublicAccess = (
  operation: 'readPublic',
) => (_req: Request, res: Response, next: () => void): void => {
  if (!isRegisteredOperation('trust_score', operation)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (
      error.message === 'businessId must be a positive integer'
      || error.message === 'trustLevel must be bronze, silver, gold, or platinum'
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

export const registerTrustScoreRoutes = (
  app: Express,
  service: TrustScoreService,
): void => {
  app.get(
    '/api/v1/public/trust-scores',
    requireTrustScorePublicAccess('readPublic'),
    async (req: Request, res: Response) => {
      try {
        const trustLevel = trustLevelParam(req.query.trustLevel);
        if (trustLevel === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const trustScores = await service.listPublicByTrustLevel(trustLevel);
        res.status(200).json({ trustScores });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/public/trust-scores/:businessId',
    requireTrustScorePublicAccess('readPublic'),
    async (req: Request, res: Response) => {
      try {
        const value = routeParam(req.params.businessId);
        const businessId = value === null ? null : positiveIntegerId(value);
        if (businessId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }

        const trustScore = await service.getPublicTrustScore(businessId);
        if (!trustScore) {
          res.status(404).json({ error: 'not_found' });
          return;
        }

        res.status(200).json({ trustScore });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/trust-scores',
    authMiddleware,
    requireTrustScoreAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const trustLevel = trustLevelParam(req.query.trustLevel);
        if (trustLevel === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }

        const trustScores = await service.listByTrustLevel(context, trustLevel);
        res.status(200).json({ trustScores });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/trust-scores/:businessId',
    authMiddleware,
    requireTrustScoreAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const value = routeParam(req.params.businessId);
        const businessId = value === null ? null : positiveIntegerId(value);
        if (businessId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }

        const trustScore = await service.getTrustScore(context, businessId);
        if (!trustScore) {
          res.status(404).json({ error: 'not_found' });
          return;
        }

        res.status(200).json({ trustScore });
      } catch (error) {
        handleError(error, res);
      }
    },
  );

  app.post(
    '/api/v1/trust-scores/:businessId/calculate',
    authMiddleware,
    requireTrustScoreAccess('calculate'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const value = routeParam(req.params.businessId);
        const businessId = value === null ? null : positiveIntegerId(value);
        if (businessId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }

        const trustScore = await service.calculateTrustScore(context, businessId);
        res.status(200).json({ trustScore });
      } catch (error) {
        handleError(error, res);
      }
    },
  );
};

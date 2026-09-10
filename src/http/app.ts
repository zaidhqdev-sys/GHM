import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { PostgresBusinessIdentityRepository } from '../resources/business-identity/repository';
import { BusinessIdentityServiceImpl } from '../resources/business-identity/service';
import { BusinessIdentityService } from '../resources/business-identity/contracts';
import { isRegisteredOperation, ResourceOperation } from '../resources/registry';
import { config } from '../config';

export interface AppDependencies {
  readonly businessIdentityService?: BusinessIdentityService;
}

const requireRegisteredAccess = (resource: Parameters<typeof canAccessResource>[1], operation: ResourceOperation) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation(resource, operation) || !canAccessResource(context, resource)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Business creation requires a business operator role' || error.message === 'Business management permission required') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (error.message === 'Authenticated account not found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
  }
  console.error('HTTP request failed:', error);
  res.status(500).json({ error: 'internal_error' });
};

export const createApp = (dependencies: AppDependencies = {}): express.Express => {
  const app = express();
  const service = dependencies.businessIdentityService ?? new BusinessIdentityServiceImpl(new PostgresBusinessIdentityRepository());

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req: Request, res: Response) => {
    res.json({ service: 'GHM Core Engine', version: '2.0.0' });
  });

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/api/v1/profile', requireAuth, requireRegisteredAccess('profile', 'read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const profile = await service.getOwnProfile(context);
      res.status(200).json({ profile });
    } catch (error) {
      handleError(error, res);
    }
  });

  return app;
};

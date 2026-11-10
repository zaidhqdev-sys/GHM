import express, { type Express, type Request, type Response } from 'express';
import {
  AccessJwtError,
  type AccessJwtVerifier,
} from '../auth/foundation/access-jwt-verifier';
import type { ActorIdentityReader } from './actor-identity-reader';

export interface ActorGatewayDependencies {
  verifier: AccessJwtVerifier;
  actorIdentityReader: ActorIdentityReader;
}

const isSqlState = (error: unknown, code: string): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);

export const createActorGatewayApp = (dependencies: ActorGatewayDependencies): Express => {
  const app = express();
  app.disable('x-powered-by');

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/v1/actor/me', async (req: Request, res: Response) => {
    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    let accountId: number;
    try {
      accountId = dependencies.verifier.verify(token).accountId;
    } catch (error) {
      if (error instanceof AccessJwtError) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    try {
      const actor = await dependencies.actorIdentityReader.readOwnIdentity(accountId);
      res.status(200).json({
        actor: {
          accountId: actor.accountId,
          role: actor.role,
          fullName: actor.fullName,
        },
      });
    } catch (error) {
      if (isSqlState(error, '42501')) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'actor.identity.read',
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          code: isSqlState(error, '08000') ? '08000' : undefined,
        },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  return app;
};

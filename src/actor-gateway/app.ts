import express, { type Express, type Request, type Response } from 'express';
import {
  AccessJwtError,
  type AccessJwtVerifier,
} from '../auth/foundation/access-jwt-verifier';
import type { ActorIdentityReader } from './actor-identity-reader';
import type { BusinessRegistrationIdentityReader } from './business-registration-identity-reader';
import type { BusinessProfileReader } from './business-profile-reader';

export interface ActorGatewayDependencies {
  verifier: AccessJwtVerifier;
  actorIdentityReader: ActorIdentityReader;
  businessRegistrationIdentityReader?: BusinessRegistrationIdentityReader;
  businessProfileReader?: BusinessProfileReader;
}

const isSqlState = (error: unknown, code: string): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);

export const createActorGatewayApp = (dependencies: ActorGatewayDependencies): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

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

  app.get('/v1/businesses/:businessId/registration-identity', async (req: Request, res: Response) => {
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
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const rawBusinessId = req.params.businessId;
    if (typeof rawBusinessId !== 'string' || !/^[1-9][0-9]*$/.test(rawBusinessId)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const businessId = Number(rawBusinessId);
    if (!Number.isSafeInteger(businessId) || businessId <= 0) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!dependencies.businessRegistrationIdentityReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }

    try {
      const registrationIdentity = await dependencies.businessRegistrationIdentityReader.readRegistrationIdentity(
        accountId,
        businessId,
      );
      res.status(200).json({ registrationIdentity });
    } catch (error) {
      if (isSqlState(error, '42501') || isSqlState(error, 'P0001')) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'business.registrationIdentity.read',
        error: {
          name: error instanceof Error ? error.name : 'UnknownError',
          code: isSqlState(error, '08000') ? '08000' : undefined,
        },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  app.put('/v1/businesses/:businessId/registration-identity', async (req: Request, res: Response) => {
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
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const rawBusinessId = req.params.businessId;
    if (typeof rawBusinessId !== 'string' || !/^[1-9][0-9]*$/.test(rawBusinessId)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const businessId = Number(rawBusinessId);
    if (!Number.isSafeInteger(businessId) || businessId <= 0) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const allowed = new Set(['registrationStatus', 'registrationNumber', 'legalName']);
    const keys = Object.keys(body);
    if (
      keys.length !== allowed.size ||
      keys.some((key) => !allowed.has(key)) ||
      (body.registrationStatus !== null && body.registrationStatus !== 'registered' && body.registrationStatus !== 'unregistered') ||
      (body.registrationNumber !== null && typeof body.registrationNumber !== 'string') ||
      (body.legalName !== null && typeof body.legalName !== 'string')
    ) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const registrationNumber = body.registrationNumber as string | null;
    const legalName = body.legalName as string | null;
    if (body.registrationStatus === 'registered') {
      const normalizedNumber = (registrationNumber ?? '').trim();
      const normalizedLegalName = (legalName ?? '').trim();
      if (normalizedNumber.length < 1 || normalizedNumber.length > 120 || normalizedLegalName.length < 1 || normalizedLegalName.length > 200) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      body.registrationNumber = normalizedNumber;
      body.legalName = normalizedLegalName;
    } else if (registrationNumber !== null || legalName !== null) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!dependencies.businessRegistrationIdentityReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }

    try {
      const registrationIdentity = await dependencies.businessRegistrationIdentityReader.updateRegistrationIdentity(
        accountId,
        {
          businessId,
          registrationStatus: body.registrationStatus as 'registered' | 'unregistered' | null,
          registrationNumber: body.registrationNumber as string | null,
          legalName: body.legalName as string | null,
        },
      );
      res.status(200).json({ registrationIdentity });
    } catch (error) {
      if (isSqlState(error, '42501') || isSqlState(error, 'P0001')) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      if (isSqlState(error, '22023') || isSqlState(error, '23514')) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'business.registrationIdentity.update',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });


  app.patch('/v1/businesses/:businessId/profile', async (req: Request, res: Response) => {
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
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const rawBusinessId = req.params.businessId;
    if (typeof rawBusinessId !== 'string' || !/^[1-9][0-9]*$/.test(rawBusinessId)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const businessId = Number(rawBusinessId);
    const allowed = new Set([
      'name', 'slug', 'description', 'phone', 'email', 'category',
      'province', 'city', 'physicalAddress', 'whatsapp', 'website',
      'isSupplier', 'yearsInBusiness', 'latitude', 'longitude',
      'avatarLetter', 'avatarColor',
    ]);
    if (
      !Number.isSafeInteger(businessId) || businessId <= 0 ||
      !req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).length === 0 ||
      Object.keys(req.body).some((key) => !allowed.has(key))
    ) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!dependencies.businessProfileReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }

    try {
      const businessProfile = await dependencies.businessProfileReader.updateBusinessProfile(
        accountId,
        businessId,
        req.body as Record<string, unknown>,
      );
      res.status(200).json({ businessProfile });
    } catch (error) {
      if (isSqlState(error, '42501') || isSqlState(error, 'P0001')) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      if (isSqlState(error, '22023') || isSqlState(error, '23514')) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'business.profile.update',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  return app;
};

import express, { type Express, type Request, type Response } from 'express';
import {
  AccessJwtError,
  type AccessJwtVerifier,
} from '../auth/foundation/access-jwt-verifier';
import type { ActorIdentityReader } from './actor-identity-reader';
import type { BusinessRegistrationIdentityReader } from './business-registration-identity-reader';
import type { CapabilityGovernanceReader, GatewayCapabilityDraftInput } from './capability-governance-reader';
import type { SupplierClassificationReader } from './supplier-classification-reader';

export interface ActorGatewayDependencies {
  verifier: AccessJwtVerifier;
  actorIdentityReader: ActorIdentityReader;
  businessRegistrationIdentityReader?: BusinessRegistrationIdentityReader;
  capabilityGovernanceReader?: CapabilityGovernanceReader;
  supplierClassificationReader?: SupplierClassificationReader;
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


  const capabilityRouteActor = (req: Request, res: Response): number | null => {
    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) { res.status(401).json({ error: 'unauthorized' }); return null; }
    try { return dependencies.verifier.verify(authorization.slice('Bearer '.length).trim()).accountId; }
    catch { res.status(401).json({ error: 'unauthorized' }); return null; }
  };
  const capabilityDto = (c: import('./capability-governance-reader').GatewayCapability) => ({
    id:c.id,parentId:c.parentId,name:c.name,slug:c.slug,description:c.description,sortOrder:c.sortOrder,
    lifecycleStatus:c.lifecycleStatus,taxonomyVersion:c.taxonomyVersion,effectiveFrom:c.effectiveFrom,
    effectiveTo:c.effectiveTo,sourceAuthority:c.sourceAuthority,sourceReference:c.sourceReference,
    replacedByCapabilityId:c.replacedByCapabilityId,isSelectable:c.isSelectable,createdAt:c.createdAt,updatedAt:c.updatedAt,
  });
  const capabilityFailure = (error: unknown, res: Response): void => {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === '42501') { res.status(403).json({ error: 'forbidden' }); return; }
    if (code === '22023' || code === '23514') { res.status(400).json({ error: 'invalid_request' }); return; }
    if (code === '23505' || code === 'P0001') { res.status(409).json({ error: 'conflict' }); return; }
    console.error(JSON.stringify({event:'actor_gateway_operation_failed',operation:'capability.governance',error:{name:error instanceof Error?error.name:'UnknownError'}}));
    res.status(503).json({error:'service_unavailable'});
  };
  const parseCapabilityDraft = (body: unknown): GatewayCapabilityDraftInput | null => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const b=body as Record<string,unknown>;
    const allowed=['name','slug','description','parentId','sortOrder','sourceReference'];
    if(Object.keys(b).some(k=>!allowed.includes(k)) || typeof b.name!=='string' || typeof b.slug!=='string') return null;
    if(b.description!==undefined && b.description!==null && typeof b.description!=='string') return null;
    if(b.parentId!==undefined && b.parentId!==null && (typeof b.parentId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.parentId))) return null;
    if(b.sortOrder!==undefined && (!Number.isSafeInteger(b.sortOrder) || Number(b.sortOrder)<0)) return null;
    if(b.sourceReference!==undefined && b.sourceReference!==null && typeof b.sourceReference!=='string') return null;
    return {name:b.name,slug:b.slug,description:b.description as string|null|undefined,parentId:b.parentId as string|null|undefined,sortOrder:b.sortOrder as number|undefined,sourceReference:b.sourceReference as string|null|undefined};
  };
  const capabilityReader = dependencies.capabilityGovernanceReader;
  app.get('/v1/admin/capabilities', async (req: Request, res: Response) => {
    const actor=capabilityRouteActor(req,res); if(actor===null)return;
    if(!capabilityReader){res.status(503).json({error:'service_unavailable'});return;}
    try { const capabilities=await capabilityReader.list(actor); res.status(200).json({capabilities:capabilities.map(capabilityDto)}); }
    catch(error){capabilityFailure(error,res);}
  });
  app.post('/v1/admin/capabilities/drafts', async (req: Request, res: Response) => {
    const actor=capabilityRouteActor(req,res); if(actor===null)return;
    const input=parseCapabilityDraft(req.body); if(!input){res.status(400).json({error:'invalid_request'});return;}
    if(!capabilityReader){res.status(503).json({error:'service_unavailable'});return;}
    try { const capability=await capabilityReader.createDraft(actor,input); res.status(201).json({capability:capabilityDto(capability)}); }
    catch(error){capabilityFailure(error,res);}
  });
  app.patch('/v1/admin/capabilities/:capabilityId/draft', async (req: Request, res: Response) => {
    const actor=capabilityRouteActor(req,res); if(actor===null)return;
    const id=req.params.capabilityId;
    if(typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){res.status(400).json({error:'invalid_request'});return;}
    const input=parseCapabilityDraft(req.body); if(!input){res.status(400).json({error:'invalid_request'});return;}
    if(!capabilityReader){res.status(503).json({error:'service_unavailable'});return;}
    try { const capability=await capabilityReader.updateDraft(actor,id,input); res.status(200).json({capability:capabilityDto(capability)}); }
    catch(error){capabilityFailure(error,res);}
  });
  app.post('/v1/admin/capabilities/:capabilityId/transition', async (req: Request, res: Response) => {
    const actor=capabilityRouteActor(req,res); if(actor===null)return;
    const id=req.params.capabilityId; const b=req.body as Record<string,unknown>|null;
    if(typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
      !b || typeof b!=='object' || Array.isArray(b) || Object.keys(b).some(k=>!['targetStatus','replacedByCapabilityId'].includes(k)) ||
      !['active','deprecated','retired'].includes(String(b.targetStatus)) ||
      (b.replacedByCapabilityId!==undefined && b.replacedByCapabilityId!==null && (typeof b.replacedByCapabilityId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.replacedByCapabilityId)))) {
      res.status(400).json({error:'invalid_request'});return;
    }
    if(!capabilityReader){res.status(503).json({error:'service_unavailable'});return;}
    try { const capability=await capabilityReader.transition(actor,id,b.targetStatus as 'active'|'deprecated'|'retired',b.replacedByCapabilityId as string|null|undefined); res.status(200).json({capability:capabilityDto(capability)}); }
    catch(error){capabilityFailure(error,res);}
  });

  app.put('/v1/businesses/:businessId/supplier-classification', async (req: Request, res: Response) => {
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
    if (!Number.isSafeInteger(businessId) || businessId <= 0 ||
        !req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
        Object.keys(req.body).length !== 1 || typeof req.body.isSupplier !== 'boolean') {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!dependencies.supplierClassificationReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }

    try {
      const supplierClassification = await dependencies.supplierClassificationReader.updateSupplierClassification(
        accountId,
        businessId,
        req.body.isSupplier,
      );
      res.status(200).json({ supplierClassification });
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
        operation: 'business.supplierClassification.update',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  return app;
};

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import {
  type AccessJwtVerifier,
} from '../auth/foundation/access-jwt-verifier';
import type { ActorIdentityReader } from './actor-identity-reader';
import type { BusinessRegistrationIdentityReader } from './business-registration-identity-reader';
import type { CapabilityGovernanceReader, GatewayCapabilityDraftInput } from './capability-governance-reader';
import type { SupplierClassificationReader } from './supplier-classification-reader';
import type { BusinessProfileReader } from './business-profile-reader';
import type { GatewayCapabilityMutationReader } from './business-capability-mutation-reader';
import type { SavedBusinessGatewayReader } from './saved-business-reader';
import type { BusinessHoursGatewayReader } from './business-hours-reader';
import type { TrustScoreGatewayReader } from './trust-score-reader';
import type { BusinessLogoGatewayReader } from './business-logo-reader';

export interface ActorGatewayAppOptions {
  rateLimitLimit?: number;
  rateLimitWindowMs?: number;
}

export interface ActorGatewayDependencies {
  verifier: AccessJwtVerifier;
  actorIdentityReader: ActorIdentityReader;
  businessRegistrationIdentityReader?: BusinessRegistrationIdentityReader;
  capabilityGovernanceReader?: CapabilityGovernanceReader;
  supplierClassificationReader?: SupplierClassificationReader;
  businessProfileReader?: BusinessProfileReader;
  businessCapabilityMutationReader?: GatewayCapabilityMutationReader;
  savedBusinessReader?: SavedBusinessGatewayReader;
  businessHoursReader?: BusinessHoursGatewayReader;
  trustScoreReader?: TrustScoreGatewayReader;
  businessLogoReader?: BusinessLogoGatewayReader;
}

const isSqlState = (error: unknown, code: string): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);

export const createActorGatewayApp = (
  dependencies: ActorGatewayDependencies,
  options: ActorGatewayAppOptions = {},
): Express => {
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // Authenticate once before any protected route, then enforce a per-account
  // budget. Keying by the verified GHM account avoids trusting proxy IP headers
  // and avoids putting every caller behind Render's shared proxy in one bucket.
  const authenticateGatewayActor = (req: Request, res: Response, next: NextFunction): void => {
    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const accountId = dependencies.verifier.verify(authorization.slice('Bearer '.length).trim()).accountId;
      res.locals.actorAccountId = accountId;
      next();
    } catch {
      res.status(401).json({ error: 'unauthorized' });
    }
  };
  app.use('/v1', authenticateGatewayActor);
  app.use('/v1', rateLimit({
    windowMs: options.rateLimitWindowMs ?? 60_000,
    limit: options.rateLimitLimit ?? 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_req, res) => {
      const accountId = res.locals.actorAccountId;
      return Number.isSafeInteger(accountId) ? `actor:${accountId}` : 'actor:unverified';
    },
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited' });
    },
  }));

  // Do not spend JSON parsing work on unauthenticated requests.
  app.use('/v1', express.json({ limit: '16kb' }));

  app.get('/v1/actor/me', async (req: Request, res: Response) => {
    const accountId = res.locals.actorAccountId as number;

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
    const accountId = res.locals.actorAccountId as number;

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
    const accountId = res.locals.actorAccountId as number;

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

  const capabilityRouteActor = (res: Response): number =>
    res.locals.actorAccountId as number;
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
    const actor=capabilityRouteActor(res);
    if(!capabilityReader){res.status(503).json({error:'service_unavailable'});return;}
    try { const capabilities=await capabilityReader.list(actor); res.status(200).json({capabilities:capabilities.map(capabilityDto)}); }
    catch(error){capabilityFailure(error,res);}
  });
  app.post('/v1/admin/capabilities/drafts', async (req: Request, res: Response) => {
    const actor=capabilityRouteActor(res);
    const input=parseCapabilityDraft(req.body); if(!input){res.status(400).json({error:'invalid_request'});return;}
    if(!capabilityReader){res.status(503).json({error:'service_unavailable'});return;}
    try { const capability=await capabilityReader.createDraft(actor,input); res.status(201).json({capability:capabilityDto(capability)}); }
    catch(error){capabilityFailure(error,res);}
  });
  app.patch('/v1/admin/capabilities/:capabilityId/draft', async (req: Request, res: Response) => {
    const actor=capabilityRouteActor(res);
    const id=req.params.capabilityId;
    if(typeof id!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){res.status(400).json({error:'invalid_request'});return;}
    const input=parseCapabilityDraft(req.body); if(!input){res.status(400).json({error:'invalid_request'});return;}
    if(!capabilityReader){res.status(503).json({error:'service_unavailable'});return;}
    try { const capability=await capabilityReader.updateDraft(actor,id,input); res.status(200).json({capability:capabilityDto(capability)}); }
    catch(error){capabilityFailure(error,res);}
  });
  app.post('/v1/admin/capabilities/:capabilityId/transition', async (req: Request, res: Response) => {
    const actor=capabilityRouteActor(res);
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
    const accountId = res.locals.actorAccountId as number;

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

  app.patch('/v1/businesses/:businessId/profile', async (req: Request, res: Response) => {
    const accountId = res.locals.actorAccountId as number;

    const rawBusinessId = req.params.businessId;
    if (typeof rawBusinessId !== 'string' || !/^[1-9][0-9]*$/.test(rawBusinessId)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const businessId = Number(rawBusinessId);
    const allowed = new Set([
      'name', 'slug', 'description', 'phone', 'email', 'category',
      'province', 'city', 'physicalAddress', 'whatsapp', 'website',
      'yearsInBusiness', 'latitude', 'longitude',
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


  const mutationReader = dependencies.businessCapabilityMutationReader;
  const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
  app.put('/v1/businesses/:businessId/capabilities', async (req: Request, res: Response) => {
    const raw=req.params.businessId; const businessId=typeof raw==='string'&&/^[1-9][0-9]*$/.test(raw)?Number(raw):NaN;
    const body=req.body as Record<string,unknown>|null;
    if(!positiveId(businessId)||!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!Array.isArray(body.assertions)){res.status(400).json({error:'invalid_request'});return;}
    if(!mutationReader){res.status(503).json({error:'service_unavailable'});return;}
    try{const capabilities=await mutationReader.replace(res.locals.actorAccountId as number,businessId,body.assertions as never);res.status(200).json({capabilities});}
    catch(error){capabilityFailure(error,res);}
  });
  app.post('/v1/business-capabilities/:id/verification', async (req: Request,res: Response)=>{
    const raw=req.params.id;const id=typeof raw==='string'&&/^[1-9][0-9]*$/.test(raw)?Number(raw):NaN;const b=req.body as Record<string,unknown>|null;
    const statuses=['unverified','pending','verified','rejected','revoked','expired'];
    if(!positiveId(id)||!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['expectedStatus','targetStatus','reason'].includes(k))||!statuses.includes(String(b.expectedStatus))||!statuses.includes(String(b.targetStatus))||(b.reason!==undefined&&b.reason!==null&&typeof b.reason!=='string')){res.status(400).json({error:'invalid_request'});return;}
    if(!mutationReader){res.status(503).json({error:'service_unavailable'});return;}
    try{const capability=await mutationReader.verify(res.locals.actorAccountId as number,id,b.expectedStatus as never,b.targetStatus as never,(b.reason as string|null|undefined)??null);res.status(200).json({capability});}
    catch(error){capabilityFailure(error,res);}
  });
  app.post('/v1/business-capability-evidence', async (req: Request,res: Response)=>{
    const b=req.body as Record<string,unknown>|null;
    const allowed=['businessCapabilityId','evidenceType','title','description','issuerName','referenceNumber','evidenceUrl','issuedOn','expiresOn','visibility'];
    if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!allowed.includes(k))||!positiveId(b.businessCapabilityId)||typeof b.evidenceType!=='string'||typeof b.title!=='string'){res.status(400).json({error:'invalid_request'});return;}
    if(!mutationReader){res.status(503).json({error:'service_unavailable'});return;}
    try{const evidence=await mutationReader.submitEvidence(res.locals.actorAccountId as number,b as never);res.status(201).json({evidence});}
    catch(error){capabilityFailure(error,res);}
  });
  app.patch('/v1/business-capability-evidence/:id/review', async (req: Request,res: Response)=>{
    const raw=req.params.id;const id=typeof raw==='string'&&/^[1-9][0-9]*$/.test(raw)?Number(raw):NaN;const b=req.body as Record<string,unknown>|null;
    if(!positiveId(id)||!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['decision','reason'].includes(k))||!['verified','rejected','revoked'].includes(String(b.decision))||(b.reason!==undefined&&b.reason!==null&&typeof b.reason!=='string')){res.status(400).json({error:'invalid_request'});return;}
    if(!mutationReader){res.status(503).json({error:'service_unavailable'});return;}
    try{const evidence=await mutationReader.reviewEvidence(res.locals.actorAccountId as number,id,b.decision as never,(b.reason as string|null|undefined)??null);res.status(200).json({evidence});}
    catch(error){capabilityFailure(error,res);}
  });

  const businessLogoReader = dependencies.businessLogoReader;
  app.put('/v1/businesses/:businessId/logo', async (req: Request, res: Response) => {
    const raw = req.params.businessId;
    const businessId = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN;
    const body = req.body as Record<string, unknown> | null;
    if (!Number.isSafeInteger(businessId) || businessId <= 0 || !body || typeof body !== 'object'
      || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, 'objectId')
      || (body.objectId !== null && (!Number.isSafeInteger(body.objectId) || Number(body.objectId) <= 0))) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!businessLogoReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }
    try {
      const previousObjectId = await businessLogoReader.bind(
        res.locals.actorAccountId as number,
        businessId,
        body.objectId as number | null,
      );
      res.status(200).json({ previousObjectId });
    } catch (error) {
      if (isSqlState(error, '42501') || isSqlState(error, 'P0001')) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'business.logo.bind',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  const trustScoreReader = dependencies.trustScoreReader;
  app.post('/v1/trust-scores/:businessId/calculate', async (req: Request, res: Response) => {
    const raw = req.params.businessId;
    const businessId = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(businessId) || businessId <= 0) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!trustScoreReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }
    try {
      const trustScore = await trustScoreReader.calculate(res.locals.actorAccountId as number, businessId);
      res.status(200).json({ trustScore });
    } catch (error) {
      if (isSqlState(error, '42501') || isSqlState(error, 'P0001')) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'trust.score.calculate',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  const businessHoursReader = dependencies.businessHoursReader;
  app.get('/v1/businesses/:businessId/hours', async (req: Request, res: Response) => {
    const raw = req.params.businessId;
    const businessId = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(businessId) || businessId <= 0) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!businessHoursReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }
    try {
      const hours = await businessHoursReader.list(res.locals.actorAccountId as number, businessId);
      res.status(200).json({ hours });
    } catch (error) {
      if (isSqlState(error, '42501') || isSqlState(error, 'P0001')) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'business.hours.read',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  app.put('/v1/businesses/:businessId/hours', async (req: Request, res: Response) => {
    const raw = req.params.businessId;
    const businessId = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN;
    const body = req.body as Record<string, unknown> | null;
    if (!Number.isSafeInteger(businessId) || businessId <= 0 || !body || typeof body !== 'object'
      || Array.isArray(body) || Object.keys(body).length !== 1 || !Array.isArray(body.hours) || body.hours.length > 7) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    const hours = body.hours.map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const row = entry as Record<string, unknown>;
      if (Object.keys(row).some(key => !['day_of_week', 'is_closed', 'open_time', 'close_time'].includes(key))
        || !Number.isInteger(row.day_of_week) || (row.day_of_week as number) < 0 || (row.day_of_week as number) > 6
        || typeof row.is_closed !== 'boolean'
        || (row.open_time !== null && typeof row.open_time !== 'string')
        || (row.close_time !== null && typeof row.close_time !== 'string')) return null;
      return {
        day_of_week: row.day_of_week as number,
        is_closed: row.is_closed as boolean,
        open_time: row.open_time as string | null,
        close_time: row.close_time as string | null,
      };
    });
    if (hours.some(row => row === null)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!businessHoursReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }
    try {
      const updated = await businessHoursReader.replace(
        res.locals.actorAccountId as number,
        businessId,
        hours.filter((row): row is NonNullable<typeof row> => row !== null),
      );
      res.status(200).json({ hours: updated });
    } catch (error) {
      if (isSqlState(error, '42501') || isSqlState(error, 'P0001')) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      if (isSqlState(error, '22023') || isSqlState(error, '23514')) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'business.hours.replace',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  const savedBusinessReader = dependencies.savedBusinessReader;
  const positiveSavedBusinessId = (value: unknown): value is number =>
    Number.isSafeInteger(value) && Number(value) > 0;

  app.get('/v1/saved-businesses', async (_req: Request, res: Response) => {
    if (!savedBusinessReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }
    try {
      const savedBusinesses = await savedBusinessReader.list(res.locals.actorAccountId as number);
      res.status(200).json({ savedBusinesses });
    } catch (error) {
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'saved_business.read',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  app.get('/v1/saved-businesses/:savedBusinessId', async (req: Request, res: Response) => {
    const raw = req.params.savedBusinessId;
    const id = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN;
    if (!positiveSavedBusinessId(id)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!savedBusinessReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }
    try {
      const savedBusiness = await savedBusinessReader.get(res.locals.actorAccountId as number, id);
      if (!savedBusiness) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ savedBusiness });
    } catch (error) {
      if (isSqlState(error, '42501') || isSqlState(error, 'P0001')) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'saved_business.read',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  app.post('/v1/saved-businesses', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || !positiveSavedBusinessId(body.businessId)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!savedBusinessReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }
    try {
      const savedBusiness = await savedBusinessReader.create(
        res.locals.actorAccountId as number,
        body.businessId,
      );
      res.status(201).json({ savedBusiness });
    } catch (error) {
      if (isSqlState(error, '42501') || isSqlState(error, 'P0001')) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      if (isSqlState(error, '23505')) {
        res.status(409).json({ error: 'conflict' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'saved_business.create',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  app.delete('/v1/saved-businesses/:savedBusinessId', async (req: Request, res: Response) => {
    const raw = req.params.savedBusinessId;
    const id = typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : NaN;
    if (!positiveSavedBusinessId(id)) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
    if (!savedBusinessReader) {
      res.status(503).json({ error: 'service_unavailable' });
      return;
    }
    try {
      const deleted = await savedBusinessReader.delete(res.locals.actorAccountId as number, id);
      if (!deleted) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      if (isSqlState(error, '42501') || isSqlState(error, 'P0001')) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      console.error(JSON.stringify({
        event: 'actor_gateway_operation_failed',
        operation: 'saved_business.delete',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(503).json({ error: 'service_unavailable' });
    }
  });

  return app;
};

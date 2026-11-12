import type { Express, Request, Response, RequestHandler } from 'express';
import { canAccessResource, type AuthContext } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';
import { requireAuth } from '../auth/http';
import type { BusinessCapabilityEvidenceService, CreateBusinessCapabilityEvidenceInput, EvidenceDecision } from '../resources/business-capability-evidence/contracts';
import { CapabilityMutationGatewayError, type HttpCapabilityMutationGatewayClient } from './capability-mutation-gateway-client';

const requireEvidenceAccess = (operation: 'read' | 'create' | 'readPending' | 'transition') => (req: Request,res: Response,next: () => void) => {
  const context = req.authContext as AuthContext | undefined;
  if (!context || !isRegisteredOperation('business_capability_evidence',operation) || !canAccessResource(context,'business_capability_evidence')) { res.status(403).json({error:'forbidden'}); return; }
  next();
};
const idParam = (value: string | string[]) => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
const parseCreate = (body: unknown): CreateBusinessCapabilityEvidenceInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const x = body as Record<string, unknown>;
  const allowed = new Set(['businessCapabilityId','evidenceType','title','description','issuerName','referenceNumber','evidenceUrl','issuedOn','expiresOn','visibility']);
  if (Object.keys(x).some(k => !allowed.has(k))) return null;
  if (!Number.isSafeInteger(x.businessCapabilityId) || (x.businessCapabilityId as number) <= 0) return null;
  if (typeof x.evidenceType !== 'string' || typeof x.title !== 'string') return null;
  return x as unknown as CreateBusinessCapabilityEvidenceInput;
};
const fail = (error: unknown, res: Response) => {
  const message = error instanceof Error ? error.message : '';
  if (/required|invalid|must be|later than|not found|not reviewable|not permitted|authority|access/i.test(message)) {
    const forbidden = /authority|access|Business account|Business access|management permission/i.test(message);
    res.status(forbidden ? 403 : /not found|not reviewable/i.test(message) ? 404 : 400).json({ error: forbidden ? 'forbidden' : 'invalid_request' });
    return;
  }
  console.error(JSON.stringify({event:'http_request_failed',error:{name:error instanceof Error ? error.name : 'UnknownError'}}));
  res.status(500).json({error:'internal_error'});
};

export const registerBusinessCapabilityEvidenceRoutes = (
  app: Express, service: BusinessCapabilityEvidenceService, authMiddleware: RequestHandler = requireAuth,
  gatewayClient?: HttpCapabilityMutationGatewayClient, gatewayRequired = false,
) => {
  app.post('/api/v1/business-capability-evidence', authMiddleware, requireEvidenceAccess('create'), async (req: Request,res: Response) => {
    try {
      const input = parseCreate(req.body);
      if (!input) { res.status(400).json({error:'invalid_request'}); return; }
      if(gatewayClient||gatewayRequired){
        if((req.authContext as AuthContext).role!=='business'){res.status(403).json({error:'forbidden'});return;}
        const authorization=req.header('authorization');
        if(!authorization?.startsWith('Bearer ')||!authorization.slice(7).trim()){res.status(401).json({error:'unauthorized'});return;}
        if(!gatewayClient){res.status(503).json({error:'service_unavailable'});return;}
        const result=await gatewayClient.submitEvidence(authorization.slice(7).trim(),input);
        res.status(201).json(result);return;
      }
      const evidence = await service.create(req.authContext as AuthContext,input);
      res.status(201).json({evidence});
    } catch(error) { if(error instanceof CapabilityMutationGatewayError){res.status(error.status===400?400:error.status===403||error.status===404?404:503).json({error:error.status===400?'invalid_request':error.status===403||error.status===404?'not_found':'service_unavailable'});return;} if(gatewayClient||gatewayRequired){res.status(503).json({error:'service_unavailable'});return;} fail(error,res); }
  });
  app.get('/api/v1/business-capability-evidence', authMiddleware, async (req: Request,res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      if (context.role === 'admin') {
        if (!isRegisteredOperation('business_capability_evidence','readPending') || !canAccessResource(context,'business_capability_evidence')) { res.status(403).json({error:'forbidden'}); return; }
        const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 100;
        res.status(200).json({evidence: await service.listForVerification(context,limit)});
        return;
      }
      if (!isRegisteredOperation('business_capability_evidence','read') || !canAccessResource(context,'business_capability_evidence')) { res.status(403).json({error:'forbidden'}); return; }
      const businessId = typeof req.query.businessId === 'string' ? idParam(req.query.businessId) : null;
      if (businessId === null) { res.status(400).json({error:'invalid_request'}); return; }
      res.status(200).json({evidence: await service.listForBusiness(context,businessId)});
    } catch(error) { fail(error,res); }
  });
  app.patch('/api/v1/business-capability-evidence/:evidenceId/review', authMiddleware, requireEvidenceAccess('transition'), async (req: Request,res: Response) => {
    try {
      const evidenceId = idParam(req.params.evidenceId);
      if (evidenceId === null || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) { res.status(400).json({error:'invalid_request'}); return; }
      const body = req.body as Record<string, unknown>;
      if (Object.keys(body).some(k => !['decision','reason'].includes(k)) || !['verified','rejected','revoked'].includes(String(body.decision)) || (body.reason != null && typeof body.reason !== 'string')) { res.status(400).json({error:'invalid_request'}); return; }
      if(gatewayClient||gatewayRequired){
        if((req.authContext as AuthContext).role!=='admin'){res.status(403).json({error:'forbidden'});return;}
        const authorization=req.header('authorization');
        if(!authorization?.startsWith('Bearer ')||!authorization.slice(7).trim()){res.status(401).json({error:'unauthorized'});return;}
        if(!gatewayClient){res.status(503).json({error:'service_unavailable'});return;}
        const result=await gatewayClient.reviewEvidence(authorization.slice(7).trim(),evidenceId,body.decision as EvidenceDecision,(body.reason as string|null|undefined)??null);
        res.status(200).json(result);return;
      }
      const evidence = await service.review(req.authContext as AuthContext,evidenceId,body.decision as EvidenceDecision,body.reason as string | null | undefined);
      res.status(200).json({evidence});
    } catch(error) { if(error instanceof CapabilityMutationGatewayError){res.status(error.status===400?400:error.status===403||error.status===404?404:503).json({error:error.status===400?'invalid_request':error.status===403||error.status===404?'not_found':'service_unavailable'});return;} if(gatewayClient||gatewayRequired){res.status(503).json({error:'service_unavailable'});return;} fail(error,res); }
  });
};

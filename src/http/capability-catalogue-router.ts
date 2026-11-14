import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import type { Capability, CapabilityDraftInput, CapabilityLifecycle, CapabilityService } from '../resources/capability/contracts';
import { isRegisteredOperation } from '../resources/registry';
import { CapabilityGovernanceGatewayError, type CapabilityGovernanceGatewayClient } from './capability-governance-gateway-client';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toCapabilityDto = (item: Capability) => ({
  id: item.id,
  parent_id: item.parentId,
  name: item.name,
  slug: item.slug,
  description: item.description,
  sort_order: item.sortOrder,
  lifecycle_status: item.lifecycleStatus,
  taxonomy_version: item.taxonomyVersion,
  effective_from: item.effectiveFrom,
  effective_to: item.effectiveTo,
  source_authority: item.sourceAuthority,
  source_reference: item.sourceReference,
  replaced_by_capability_id: item.replacedByCapabilityId,
  is_selectable: item.isSelectable,
  created_at: item.createdAt,
  updated_at: item.updatedAt,
});

const requireCatalogueAdmin = (operation: 'read' | 'create' | 'update' | 'transition'): RequestHandler =>
  (req, res, next) => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || context.role !== 'admin'
      || !isRegisteredOperation('capability_catalogue', operation)
      || !canAccessResource(context, 'capability_catalogue')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const parseDraft = (body: unknown): CapabilityDraftInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = ['name', 'slug', 'description', 'parentId', 'sortOrder', 'sourceReference'];
  if (Object.keys(input).some(key => !allowed.includes(key))) return null;
  if (typeof input.name !== 'string' || typeof input.slug !== 'string') return null;
  if (input.description !== undefined && input.description !== null && typeof input.description !== 'string') return null;
  if (input.parentId !== undefined && input.parentId !== null && (typeof input.parentId !== 'string' || !UUID_PATTERN.test(input.parentId))) return null;
  if (input.sortOrder !== undefined && !Number.isSafeInteger(input.sortOrder)) return null;
  if (input.sourceReference !== undefined && input.sourceReference !== null && typeof input.sourceReference !== 'string') return null;
  return {
    name: input.name,
    slug: input.slug,
    description: input.description as string | null | undefined,
    parentId: input.parentId as string | null | undefined,
    sortOrder: input.sortOrder as number | undefined,
    sourceReference: input.sourceReference as string | null | undefined,
  };
};

const handleError = (error: unknown, res: Response): void => {
  const message = error instanceof Error ? error.message : '';
  if (/System administrator permission required|role admin required|not authorized/i.test(message)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  if (/Invalid|must contain|is invalid|is too long|sort order|Unsupported Capability taxonomy/i.test(message)) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }
  if (/not found|version changed|Invalid Capability lifecycle transition|replacement must|cannot identify a replacement|duplicate key|cannot be retired while|hierarchy cycle/i.test(message)) {
    res.status(409).json({ error: 'conflict' });
    return;
  }
  console.error(JSON.stringify({
    event: 'capability_catalogue_governance_failed',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerCapabilityCatalogueRoutes = (
  app: Express,
  service: CapabilityService,
  authMiddleware: RequestHandler = requireAuth,
  gatewayClient?: CapabilityGovernanceGatewayClient,
): void => {
  const gatewayToken = (req: Request, res: Response): string | null => {
    const authorization=req.header('authorization');
    if(!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()){res.status(401).json({error:'unauthorized'});return null;}
    return authorization.slice(7).trim();
  };
  const gatewayError = (error: unknown, res: Response): void => {
    if(error instanceof CapabilityGovernanceGatewayError){
      if(error.status===401 || error.status===403){res.status(403).json({error:'forbidden'});return;}
      if(error.status===400){res.status(400).json({error:'invalid_request'});return;}
      if(error.status===404 || error.status===409){res.status(409).json({error:'conflict'});return;}
    }
    console.error(JSON.stringify({event:'actor_gateway_request_failed',operation:'capability.governance',error:{name:error instanceof Error?error.name:'UnknownError'}}));
    res.status(503).json({error:'service_unavailable'});
  };
  app.get('/api/v1/capabilities', authMiddleware, async (req: Request, res: Response) => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('business_capability', 'read') ||
        !canAccessResource(context, 'business_capability')) {
      res.status(403).json({ error: 'forbidden' }); return;
    }
    try {
      const capabilities = await service.listSelectableCapabilities(context);
      res.status(200).json({ capabilities: capabilities.map(toCapabilityDto) });
    } catch {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.get('/api/v1/admin/capabilities', authMiddleware, requireCatalogueAdmin('read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      if (!gatewayClient) { res.status(503).json({ error: 'service_unavailable' }); return; }
      const token = gatewayToken(req,res); if (!token) return;
      const capabilities = await gatewayClient.list(token);
      res.status(200).json({ capabilities: capabilities.map(toCapabilityDto) });
    } catch (error) { gatewayError(error,res); }
  });

  app.post('/api/v1/admin/capabilities/drafts', authMiddleware, requireCatalogueAdmin('create'), async (req: Request, res: Response) => {
    const input = parseDraft(req.body);
    if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
    try {
      if (!gatewayClient) { res.status(503).json({ error: 'service_unavailable' }); return; }
      const token = gatewayToken(req,res); if (!token) return;
      const capability = await gatewayClient.createDraft(token,input);
      res.status(201).json({ capability: toCapabilityDto(capability) });
    } catch (error) { gatewayError(error,res); }
  });

  app.patch('/api/v1/admin/capabilities/:capabilityId/draft', authMiddleware, requireCatalogueAdmin('update'), async (req: Request, res: Response) => {
    if (!UUID_PATTERN.test(req.params.capabilityId)) { res.status(400).json({ error: 'invalid_request' }); return; }
    const input = parseDraft(req.body);
    if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
    try {
      if (!gatewayClient) { res.status(503).json({ error: 'service_unavailable' }); return; }
      const token = gatewayToken(req,res); if (!token) return;
      const capability = await gatewayClient.updateDraft(token,req.params.capabilityId,input);
      res.status(200).json({ capability: toCapabilityDto(capability) });
    } catch (error) { gatewayError(error,res); }
  });

  app.post('/api/v1/admin/capabilities/:capabilityId/transition', authMiddleware, requireCatalogueAdmin('transition'), async (req: Request, res: Response) => {
    if (!UUID_PATTERN.test(req.params.capabilityId) || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ error: 'invalid_request' }); return;
    }
    const body = req.body as Record<string, unknown>;
    if (Object.keys(body).some(key => !['targetStatus', 'replacedByCapabilityId'].includes(key))
      || typeof body.targetStatus !== 'string'
      || !['active', 'deprecated', 'retired'].includes(body.targetStatus)
      || (body.replacedByCapabilityId !== undefined && body.replacedByCapabilityId !== null
        && (typeof body.replacedByCapabilityId !== 'string' || !UUID_PATTERN.test(body.replacedByCapabilityId)))) {
      res.status(400).json({ error: 'invalid_request' }); return;
    }
    try {
      if (!gatewayClient) { res.status(503).json({ error: 'service_unavailable' }); return; }
      const token = gatewayToken(req,res); if (!token) return;
      const capability = await gatewayClient.transition(token,req.params.capabilityId,body.targetStatus as CapabilityLifecycle,body.replacedByCapabilityId as string | null | undefined);
      res.status(200).json({ capability: toCapabilityDto(capability) });
    } catch (error) { gatewayError(error,res); }
  });
};

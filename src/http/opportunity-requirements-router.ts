import { Express, Request, Response , RequestHandler} from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import {  requireAuth , requireAuth } from '../auth/http';
import type { OpportunityRequirementsService, ReplaceOpportunityCapabilityRequirementInput } from '../resources/opportunity-requirements/contracts';
import { isRegisteredOperation } from '../resources/registry';

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseReplacement = (body: unknown): readonly ReplaceOpportunityCapabilityRequirementInput[] | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.requirements) || Object.keys(input).some((key) => key !== 'requirements')) return null;
  const parsed: ReplaceOpportunityCapabilityRequirementInput[] = [];
  for (const value of input.requirements) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    const allowed = new Set(['capabilityId', 'importance', 'minimumProficiencyLevel', 'description', 'sortOrder']);
    if (Object.keys(item).some((key) => !allowed.has(key))) return null;
    if (typeof item.capabilityId !== 'string' || !UUID_RE.test(item.capabilityId)) return null;
    if (Object.hasOwn(item, 'importance') && item.importance !== 'required' && item.importance !== 'preferred') return null;
    if (Object.hasOwn(item, 'minimumProficiencyLevel') && item.minimumProficiencyLevel !== null &&
        item.minimumProficiencyLevel !== 'foundational' && item.minimumProficiencyLevel !== 'proficient' &&
        item.minimumProficiencyLevel !== 'advanced' && item.minimumProficiencyLevel !== 'expert') return null;
    if (Object.hasOwn(item, 'description') && item.description !== null && typeof item.description !== 'string') return null;
    if (Object.hasOwn(item, 'sortOrder') && (!Number.isSafeInteger(item.sortOrder) || Number(item.sortOrder) < 0)) return null;
    parsed.push({
      capabilityId: item.capabilityId as string,
      ...(Object.hasOwn(item, 'importance') ? { importance: item.importance as ReplaceOpportunityCapabilityRequirementInput['importance'] } : {}),
      ...(Object.hasOwn(item, 'minimumProficiencyLevel') ? { minimumProficiencyLevel: item.minimumProficiencyLevel as ReplaceOpportunityCapabilityRequirementInput['minimumProficiencyLevel'] } : {}),
      ...(Object.hasOwn(item, 'description') ? { description: item.description as string | null } : {}),
      ...(Object.hasOwn(item, 'sortOrder') ? { sortOrder: item.sortOrder as number } : {}),
    });
  }
  return parsed;
};

const requireRequirementsAccess = (operation: 'read' | 'replace') =>
  (req: Request, res: Response, next: () => void): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('opportunity_requirements', operation) ||
        !canAccessResource(context, 'opportunity_requirements')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Opportunity requirements access denied') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (error.message === 'Invalid opportunityId' || error.message === 'Invalid capabilityId' ||
        error.message === 'Invalid importance' || error.message === 'Invalid minimumProficiencyLevel' ||
        error.message === 'Invalid sortOrder' || error.message === 'Invalid requirement' ||
        error.message === 'Requirements must be an array' ||
        error.message.includes('Description must be between ') ||
        error.message.includes('Requirements cannot exceed ') ||
        error.message === 'All opportunity requirement capabilities must be active and selectable') {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
  }
  console.error(JSON.stringify({ event: 'http_request_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerOpportunityRequirementsRoutes = (app: Express, service: OpportunityRequirementsService): void => {
  app.get('/api/v1/opportunities/:opportunityId/requirements', authMiddleware, requireRequirementsAccess('read'), async (req, res) => {
    try {
      const value = typeof req.params.opportunityId === 'string' ? req.params.opportunityId : null;
      const opportunityId = value === null ? null : positiveIntegerId(value);
      if (opportunityId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const requirements = await service.listOpportunityRequirements(req.authContext as AuthContext, opportunityId);
      res.status(200).json({ requirements });
    } catch (error) { handleError(error, res); }
  });

  app.put('/api/v1/opportunities/:opportunityId/requirements', authMiddleware, requireRequirementsAccess('replace'), async (req, res) => {
    try {
      const value = typeof req.params.opportunityId === 'string' ? req.params.opportunityId : null;
      const opportunityId = value === null ? null : positiveIntegerId(value);
      const requirements = parseReplacement(req.body);
      if (opportunityId === null || requirements === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const result = await service.replaceOpportunityRequirements(req.authContext as AuthContext, opportunityId, requirements);
      res.status(200).json({ requirements: result });
    } catch (error) { handleError(error, res); }
  });
};

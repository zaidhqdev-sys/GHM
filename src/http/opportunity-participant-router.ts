import { Express, Request, Response, RequestHandler } from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import type { CreateOpportunityParticipantInput, OpportunityParticipantService, ParticipationRole, ParticipationStatus } from '../resources/opportunity-participant/contracts';
import { isRegisteredOperation } from '../resources/registry';

const routeParam = (value: string | string[]): string | null => typeof value === 'string' ? value : null;
const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};
const ROLES: readonly ParticipationRole[] = ['creator','owner','recipient','responder','evaluator','fulfiller'];
const STATUSES: readonly ParticipationStatus[] = ['invited','active','declined','withdrawn','removed','completed'];

const parseCreateInput = (body: unknown): CreateOpportunityParticipantInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['opportunityId','accountId','businessId','participationRole','participationStatus']);
  if (Object.keys(input).some(key => !allowed.has(key))) return null;
  if (!Number.isSafeInteger(input.opportunityId) || (input.opportunityId as number) <= 0) return null;
  if (Object.hasOwn(input,'accountId') && input.accountId !== null && (!Number.isSafeInteger(input.accountId) || (input.accountId as number) <= 0)) return null;
  if (Object.hasOwn(input,'businessId') && input.businessId !== null && (!Number.isSafeInteger(input.businessId) || (input.businessId as number) <= 0)) return null;
  if (typeof input.participationRole !== 'string' || !ROLES.includes(input.participationRole as ParticipationRole)) return null;
  if (Object.hasOwn(input,'participationStatus') && (typeof input.participationStatus !== 'string' || !STATUSES.includes(input.participationStatus as ParticipationStatus))) return null;
  return {
    opportunityId: input.opportunityId as number,
    ...(Object.hasOwn(input,'accountId') ? { accountId: input.accountId as number | null } : {}),
    ...(Object.hasOwn(input,'businessId') ? { businessId: input.businessId as number | null } : {}),
    participationRole: input.participationRole as ParticipationRole,
    ...(Object.hasOwn(input,'participationStatus') ? { participationStatus: input.participationStatus as ParticipationStatus } : {}),
  };
};

const requireParticipantAccess = (operation: 'read' | 'create') =>
  (req: Request, res: Response, next: () => void): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('opportunity_participant', operation) || !canAccessResource(context, 'opportunity_participant')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const handleError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Opportunity participant access required' || error.message === 'Opportunity participant management permission required') {
      res.status(403).json({ error: 'forbidden' }); return;
    }
    if (error.message === 'Opportunity not found' || error.message === 'Account not found' || error.message === 'Business not found or not eligible') {
      res.status(404).json({ error: 'not_found' }); return;
    }
    if (
      error.message.includes('must be a positive integer') ||
      error.message === 'Invalid participation role' ||
      error.message === 'Invalid participation status' ||
      error.message === 'Exactly one participant principal is required' ||
      error.message === 'Participant update requires at least one field'
    ) {
      res.status(400).json({ error: 'invalid_request' }); return;
    }
  }
  console.error(JSON.stringify({ event: 'http_request_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerOpportunityParticipantRoutes = (app: Express, service: OpportunityParticipantService, authMiddleware: RequestHandler = requireAuth): void => {
  app.get('/api/v1/opportunities/:opportunityId/participants', requireAuth, requireParticipantAccess('read'), async (req, res) => {
    try {
      const context = req.authContext as AuthContext;
      const value = routeParam(req.params.opportunityId);
      const opportunityId = value === null ? null : positiveIntegerId(value);
      if (opportunityId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const participants = await service.listOpportunityParticipants(context, opportunityId);
      res.status(200).json({ participants });
    } catch (error) { handleError(error, res); }
  });

  app.get('/api/v1/opportunity-participants/:participantId', requireAuth, requireParticipantAccess('read'), async (req, res) => {
    try {
      const context = req.authContext as AuthContext;
      const value = routeParam(req.params.participantId);
      const participantId = value === null ? null : positiveIntegerId(value);
      if (participantId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const participant = await service.getParticipant(context, participantId);
      if (!participant) { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ participant });
    } catch (error) { handleError(error, res); }
  });

  app.post('/api/v1/opportunity-participants', requireAuth, requireParticipantAccess('create'), async (req, res) => {
    try {
      const context = req.authContext as AuthContext;
      const input = parseCreateInput(req.body);
      if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
      const participant = await service.createParticipant(context, input);
      res.status(201).json({ participant });
    } catch (error) { handleError(error, res); }
  });
};

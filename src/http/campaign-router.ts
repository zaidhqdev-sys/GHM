import type { Express, NextFunction, Request, Response } from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation, ResourceOperation } from '../resources/registry';
import type {
  CampaignService,
  CreateCampaignInput,
  UpdateCampaignInput,
} from '../resources/campaign/contracts';
import { PostgresCampaignRepository } from '../resources/campaign/repository';
import { CampaignServiceImpl } from '../resources/campaign/service';

const requireRegisteredCampaignAccess = (operation: ResourceOperation) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('campaign', operation) || !canAccessResource(context, 'campaign')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const queryValue = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
};

const parseCreateCampaignInput = (body: unknown): CreateCampaignInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['businessId', 'title']);
  if (Object.keys(input).some((key) => !allowed.has(key))) return null;
  if (!Number.isSafeInteger(input.businessId) || (input.businessId as number) <= 0) return null;
  if (typeof input.title !== 'string') return null;
  return {
    businessId: input.businessId as number,
    title: input.title,
  };
};

const parseUpdateCampaignInput = (body: unknown): UpdateCampaignInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['title', 'status']);
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) return null;

  const next: { title?: string; status?: 'draft' | 'active' | 'archived' } = {};
  if (Object.hasOwn(input, 'title')) {
    if (typeof input.title !== 'string') return null;
    next.title = input.title;
  }
  if (Object.hasOwn(input, 'status')) {
    if (input.status !== 'draft' && input.status !== 'active' && input.status !== 'archived') return null;
    next.status = input.status;
  }
  return next;
};

const handleCampaignError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    const message = error.message;

    if (message === 'Authentication required') {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    if (
      message === 'Business management permission required' ||
      message === 'Business is not eligible for campaign creation' ||
      message === 'Insufficient role' ||
      message === 'Resource ownership required'
    ) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    if (message === 'Campaign not found or management permission required') {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    if (
      message.startsWith('Invalid campaign status transition') ||
      message === 'Archived campaign title cannot be updated' ||
      message === 'Campaign title cannot be updated in the current status'
    ) {
      res.status(409).json({ error: 'conflict' });
      return;
    }

    if (
      message === 'Campaign title must be between 1 and 200 characters' ||
      message === 'Campaign input is required' ||
      message === 'Campaign update input is required' ||
      message === 'Campaign update requires at least one field' ||
      message === 'Invalid campaign status' ||
      message.includes('must be a positive integer') ||
      message.startsWith('Invalid ')
    ) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
  }

  console.error(JSON.stringify({
    event: 'http_request_failed',
    resource: 'campaign',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerCampaignRoutes = (
  app: Express,
  service: CampaignService = new CampaignServiceImpl(new PostgresCampaignRepository()),
): void => {
  app.get(
    '/api/v1/campaigns',
    requireAuth,
    requireRegisteredCampaignAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const rawBusinessId = queryValue(req.query.businessId);
        if (rawBusinessId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const businessId = positiveIntegerId(rawBusinessId);
        if (businessId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const campaigns = await service.listCampaigns(context, businessId);
        res.status(200).json({ campaigns });
      } catch (error) {
        handleCampaignError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/campaigns/:campaignId',
    requireAuth,
    requireRegisteredCampaignAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const rawId = routeParam(req.params.campaignId);
        const campaignId = rawId === null ? null : positiveIntegerId(rawId);
        if (campaignId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const campaign = await service.getCampaign(context, campaignId);
        if (!campaign) {
          res.status(404).json({ error: 'not_found' });
          return;
        }
        res.status(200).json({ campaign });
      } catch (error) {
        handleCampaignError(error, res);
      }
    },
  );

  app.post(
    '/api/v1/campaigns',
    requireAuth,
    requireRegisteredCampaignAccess('create'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const input = parseCreateCampaignInput(req.body);
        if (!input) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const campaign = await service.createCampaign(context, input);
        res.status(201).json({ campaign });
      } catch (error) {
        handleCampaignError(error, res);
      }
    },
  );

  app.patch(
    '/api/v1/campaigns/:campaignId',
    requireAuth,
    requireRegisteredCampaignAccess('update'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const rawId = routeParam(req.params.campaignId);
        const campaignId = rawId === null ? null : positiveIntegerId(rawId);
        const input = parseUpdateCampaignInput(req.body);
        if (campaignId === null || !input) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const campaign = await service.updateCampaign(context, campaignId, input);
        res.status(200).json({ campaign });
      } catch (error) {
        handleCampaignError(error, res);
      }
    },
  );
};

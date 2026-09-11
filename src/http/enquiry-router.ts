import type { Express, NextFunction, Request, Response } from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation, ResourceOperation } from '../resources/registry';
import type { CreateEnquiryInput, EnquiryService, UpdateEnquiryStatusInput } from '../resources/enquiry/contracts';

const requireRegisteredEnquiryAccess = (operation: ResourceOperation) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('enquiry', operation) || !canAccessResource(context, 'enquiry')) {
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

const parseCreateEnquiryInput = (body: unknown): CreateEnquiryInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set([
    'businessId',
    'customerName',
    'customerPhone',
    'customerEmail',
    'project',
    'description',
    'city',
    'budgetMin',
    'budgetMax',
    'urgency',
    'source',
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key))) return null;
  if (!Number.isSafeInteger(input.businessId) || (input.businessId as number) <= 0) return null;
  for (const field of ['customerName', 'project', 'description']) {
    if (typeof input[field] !== 'string') return null;
  }
  for (const field of ['customerPhone', 'customerEmail', 'city']) {
    if (Object.hasOwn(input, field) && input[field] !== null && typeof input[field] !== 'string') return null;
  }
  for (const field of ['budgetMin', 'budgetMax']) {
    if (Object.hasOwn(input, field) && input[field] !== null && typeof input[field] !== 'number') return null;
  }
  if (Object.hasOwn(input, 'urgency') && !['standard', 'urgent', 'emergency'].includes(input.urgency as string)) return null;
  if (Object.hasOwn(input, 'source') && input.source !== 'marketplace') return null;
  return input as CreateEnquiryInput;
};

const parseStatusInput = (body: unknown): UpdateEnquiryStatusInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'archived'].includes(input.status as string)) return null;
  return { status: input.status as UpdateEnquiryStatusInput['status'] };
};

const handleEnquiryError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Business owner permission required') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (error.message === 'Enquiry target Business is not eligible' || error.message === 'Enquiry not found or business owner permission required') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (error.message === 'Invalid enquiry status transition') {
      res.status(409).json({ error: 'conflict' });
      return;
    }
    if (error.message.startsWith('Invalid ') || error.message.includes(' is required') || error.message.includes(' must be between ') || error.message.includes('must be null or a non-negative number') || error.message === 'budgetMax must be greater than or equal to budgetMin' || error.message === 'Only marketplace Enquiries may be created') {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
  }
  console.error('HTTP request failed:', error);
  res.status(500).json({ error: 'internal_error' });
};

export const registerEnquiryRoutes = (app: Express, service: EnquiryService): void => {
  app.post('/api/v1/enquiries', requireAuth, requireRegisteredEnquiryAccess('create'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const input = parseCreateEnquiryInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const enquiry = await service.createEnquiry(context, input);
      res.status(201).json({ enquiry });
    } catch (error) {
      handleEnquiryError(error, res);
    }
  });

  app.get('/api/v1/enquiries/received/:enquiryId', requireAuth, requireRegisteredEnquiryAccess('read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const rawId = routeParam(req.params.enquiryId);
      const enquiryId = rawId === null ? null : positiveIntegerId(rawId);
      if (enquiryId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const enquiry = await service.getReceivedEnquiry(context, enquiryId);
      if (!enquiry) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ enquiry });
    } catch (error) {
      handleEnquiryError(error, res);
    }
  });

  app.get('/api/v1/enquiries/:enquiryId', requireAuth, requireRegisteredEnquiryAccess('read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const rawId = routeParam(req.params.enquiryId);
      const enquiryId = rawId === null ? null : positiveIntegerId(rawId);
      if (enquiryId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const enquiry = await service.getOwnEnquiry(context, enquiryId);
      if (!enquiry) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ enquiry });
    } catch (error) {
      handleEnquiryError(error, res);
    }
  });

  app.patch('/api/v1/enquiries/received/:enquiryId/status', requireAuth, requireRegisteredEnquiryAccess('update'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const rawId = routeParam(req.params.enquiryId);
      const enquiryId = rawId === null ? null : positiveIntegerId(rawId);
      const input = parseStatusInput(req.body);
      if (enquiryId === null || !input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const enquiry = await service.updateReceivedEnquiryStatus(context, enquiryId, input);
      res.status(200).json({ enquiry });
    } catch (error) {
      handleEnquiryError(error, res);
    }
  });
};

import type { Express, NextFunction, Request, Response } from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation, ResourceOperation } from '../resources/registry';
import type { ContactAccessService } from '../resources/contact-access/contracts';
import { PostgresContactAccessRepository } from '../resources/contact-access/repository';
import { ContactAccessServiceImpl } from '../resources/contact-access/service';

const requireRegisteredContactAccess = (operation: ResourceOperation) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('contact_access', operation) || !canAccessResource(context, 'contact_access')) {
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

const parsePairIds = (
  req: Request,
): { businessId: number; opportunityId: number } | null => {
  const rawBusinessId = routeParam(req.params.businessId);
  const rawOpportunityId = routeParam(req.params.opportunityId);
  if (rawBusinessId === null || rawOpportunityId === null) return null;
  const businessId = positiveIntegerId(rawBusinessId);
  const opportunityId = positiveIntegerId(rawOpportunityId);
  if (businessId === null || opportunityId === null) return null;
  return { businessId, opportunityId };
};

const handleContactAccessError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    const message = error.message;

    if (message === 'Authentication required') {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    if (
      message === 'Insufficient role' ||
      message === 'Business read permission required' ||
      message === 'Contact Access disclosure denied'
    ) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    if (
      message === 'Opportunity Enquiry association not found' ||
      message === 'Opportunity Enquiry association is ambiguous'
    ) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    if (
      message.includes('must be a positive integer') ||
      message.startsWith('Invalid ')
    ) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
  }

  console.error(JSON.stringify({
    event: 'http_request_failed',
    resource: 'contact_access',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerContactAccessRoutes = (
  app: Express,
  service: ContactAccessService = new ContactAccessServiceImpl(new PostgresContactAccessRepository()),
): void => {
  app.get(
    '/api/v1/businesses/:businessId/opportunities/:opportunityId/contact-access',
    requireAuth,
    requireRegisteredContactAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const ids = parsePairIds(req);
        if (ids === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }

        const result = await service.getContactAccess(context, ids.businessId, ids.opportunityId);
        res.status(200).json({
          contactAccess: {
            businessId: result.businessId,
            opportunityId: result.opportunityId,
            status: result.status,
          },
        });
      } catch (error) {
        handleContactAccessError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/businesses/:businessId/opportunities/:opportunityId/contact-access/contacts',
    requireAuth,
    requireRegisteredContactAccess('disclose'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const ids = parsePairIds(req);
        if (ids === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }

        const disclosure = await service.discloseContactAccess(
          context,
          ids.businessId,
          ids.opportunityId,
        );
        res.status(200).json({
          contactDisclosure: {
            customerName: disclosure.customerName,
            customerPhone: disclosure.customerPhone,
            customerEmail: disclosure.customerEmail,
          },
        });
      } catch (error) {
        handleContactAccessError(error, res);
      }
    },
  );
};

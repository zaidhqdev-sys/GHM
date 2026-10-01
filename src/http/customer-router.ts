import { Express, Request, Response } from 'express';
import { AuthContext } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import type { Customer, CustomerService, CustomerStatus } from '../resources/customer/contracts';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseStatus = (value: unknown): CustomerStatus | null =>
  value === 'active' || value === 'archived' ? value : null;

const parseCreateCustomerInput = (body: unknown): { name: string; phone?: string | null; email?: string | null } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['name', 'phone', 'email']);
  const keys = Object.keys(input);
  if (keys.some(key => !allowed.has(key))) return null;
  if (typeof input.name !== 'string' || !input.name.trim()) return null;
  if (Object.hasOwn(input, 'phone') && input.phone !== null && typeof input.phone !== 'string') return null;
  if (Object.hasOwn(input, 'email') && input.email !== null && typeof input.email !== 'string') return null;
  return {
    name: input.name,
    ...(Object.hasOwn(input, 'phone') ? { phone: input.phone as string | null } : {}),
    ...(Object.hasOwn(input, 'email') ? { email: input.email as string | null } : {}),
  };
};

const parseStatusUpdate = (body: unknown): CustomerStatus | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'status')) return null;
  return parseStatus(input.status);
};

const requireCustomerAccess = (
  operation: 'read' | 'create' | 'update',
) => (req: Request, res: Response, next: () => void): void => {
  const context = req.authContext as AuthContext | undefined;
  if (
    !context ||
    !isRegisteredOperation('customer', operation) ||
    !canAccessResource(context, 'customer')
  ) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const handleCustomerError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Customer not found or ownership required') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (
      error.message === 'Customer input is required' ||
      error.message === 'name is required' ||
      error.message === 'Invalid Customer status' ||
      error.message === 'phone must be null or a string' ||
      error.message === 'email must be null or a string'
    ) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
  }
  console.error(JSON.stringify({
    event: 'http_request_failed',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerCustomerRoutes = (app: Express, customerService: CustomerService, authMiddleware: RequestHandler = requireAuth): void => {
  app.get(
    '/api/v1/customers',
    requireAuth,
    requireCustomerAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const statusValue = typeof req.query.status === 'string' ? req.query.status : undefined;
        if (req.query.status !== undefined && statusValue === undefined) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const status = statusValue === undefined ? undefined : parseStatus(statusValue);
        if (statusValue !== undefined && status === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const customers = await customerService.listCustomers(context, status ?? undefined);
        res.status(200).json({ customers });
      } catch (error) {
        handleCustomerError(error, res);
      }
    },
  );

  app.get(
    '/api/v1/customers/:customerId',
    requireAuth,
    requireCustomerAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const customerIdValue = routeParam(req.params.customerId);
        const customerId = customerIdValue === null ? null : positiveIntegerId(customerIdValue);
        if (customerId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const customer = await customerService.getCustomer(context, customerId);
        if (!customer) {
          res.status(404).json({ error: 'not_found' });
          return;
        }
        res.status(200).json({ customer });
      } catch (error) {
        handleCustomerError(error, res);
      }
    },
  );

  app.post(
    '/api/v1/customers',
    requireAuth,
    requireCustomerAccess('create'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const input = parseCreateCustomerInput(req.body);
        if (!input) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const customer = await customerService.createCustomer(context, input);
        res.status(201).json({ customer });
      } catch (error) {
        handleCustomerError(error, res);
      }
    },
  );

  app.patch(
    '/api/v1/customers/:customerId',
    requireAuth,
    requireCustomerAccess('update'),
    async (req: Request, res: Response) => {
      try {
        const context = req.authContext as AuthContext;
        const customerIdValue = routeParam(req.params.customerId);
        const customerId = customerIdValue === null ? null : positiveIntegerId(customerIdValue);
        const status = parseStatusUpdate(req.body);
        if (customerId === null || status === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const customer = status === 'archived'
          ? await customerService.archiveCustomer(context, customerId)
          : await customerService.restoreCustomer(context, customerId);
        res.status(200).json({ customer });
      } catch (error) {
        handleCustomerError(error, res);
      }
    },
  );
};

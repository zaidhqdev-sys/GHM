import type { Express, Request, Response, RequestHandler } from 'express';
import type { AuthContext } from '../auth/authorization';
import { canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation } from '../resources/registry';
import type { CustomerService, CustomerStatus } from '../resources/customer/contracts';
import type { QuoteService, QuoteStatus } from '../resources/quote/contracts';

const positiveId = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^[1-9]\\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const businessContext = (req: Request, res: Response): { context: AuthContext; businessId: number } | null => {
  const context = req.authContext as AuthContext | undefined;
  const businessId = positiveId(req.params.businessId);
  if (!context || businessId === null || !canAccessResource(context, 'customer') || !canAccessResource(context, 'quote')) {
    res.status(context ? 400 : 401).json({ error: context ? 'invalid_request' : 'unauthorized' });
    return null;
  }
  return { context, businessId };
};

const sendFailure = (res: Response, error: unknown): void => {
  if (error instanceof Error && (error.message === 'Business tenant access denied' || error.message === 'Customer not found or ownership required' || error.message === 'Quote not found or ownership required')) {
    res.status(404).json({ error: 'not_found' }); return;
  }
  if (error instanceof Error && (error.message.includes('required') || error.message.startsWith('Invalid ') || error.message.startsWith('Quote '))) {
    res.status(400).json({ error: 'invalid_request' }); return;
  }
  console.error(JSON.stringify({ event: 'quoteflow_business_data_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerQuoteFlowBusinessDataRoutes = (
  app: Express,
  customers: CustomerService,
  quotes: QuoteService,
  authMiddleware: RequestHandler = requireAuth,
): void => {
  app.get('/api/v1/businesses/:businessId/customers', authMiddleware, async (req, res) => {
    const scope = businessContext(req, res); if (!scope) return;
    if (!isRegisteredOperation('customer', 'read') || !customers.listBusinessCustomers) { res.status(501).json({ error: 'not_implemented' }); return; }
    try {
      const statusValue = req.query.status;
      const status = statusValue === undefined ? undefined : statusValue === 'active' || statusValue === 'archived' ? statusValue as CustomerStatus : null;
      if (status === null) { res.status(400).json({ error: 'invalid_request' }); return; }
      const result = await customers.listBusinessCustomers(scope.context, scope.businessId, status);
      res.status(200).json({ customers: result });
    } catch (error) { sendFailure(res, error); }
  });

  app.post('/api/v1/businesses/:businessId/customers', authMiddleware, async (req, res) => {
    const scope = businessContext(req, res); if (!scope) return;
    if (!isRegisteredOperation('customer', 'create') || !customers.createBusinessCustomer) { res.status(501).json({ error: 'not_implemented' }); return; }
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['name','phone','email'].includes(k)) || typeof body.name !== 'string' || !body.name.trim() || (body.phone !== undefined && body.phone !== null && typeof body.phone !== 'string') || (body.email !== undefined && body.email !== null && typeof body.email !== 'string')) {
      res.status(400).json({ error: 'invalid_request' }); return;
    }
    try {
      const customer = await customers.createBusinessCustomer(scope.context, scope.businessId, { name: body.name, phone: body.phone as string | null | undefined, email: body.email as string | null | undefined });
      res.status(201).json({ customer });
    } catch (error) { sendFailure(res, error); }
  });

  app.get('/api/v1/businesses/:businessId/customers/:customerId', authMiddleware, async (req, res) => {
    const scope = businessContext(req, res); if (!scope) return;
    const customerId = positiveId(req.params.customerId);
    if (customerId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
    if (!isRegisteredOperation('customer', 'read') || !customers.getBusinessCustomer) { res.status(501).json({ error: 'not_implemented' }); return; }
    try {
      const customer = await customers.getBusinessCustomer(scope.context, scope.businessId, customerId);
      if (!customer) { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ customer });
    } catch (error) { sendFailure(res, error); }
  });

  app.patch('/api/v1/businesses/:businessId/customers/:customerId', authMiddleware, async (req, res) => {
    const scope = businessContext(req, res); if (!scope) return;
    const customerId = positiveId(req.params.customerId);
    const body = req.body as Record<string, unknown>;
    if (customerId === null || !body || Object.keys(body).length !== 1 || (body.status !== 'active' && body.status !== 'archived')) { res.status(400).json({ error: 'invalid_request' }); return; }
    if (!isRegisteredOperation('customer', 'update')) { res.status(403).json({ error: 'forbidden' }); return; }
    const operation = body.status === 'archived' ? customers.archiveBusinessCustomer : customers.restoreBusinessCustomer;
    if (!operation) { res.status(501).json({ error: 'not_implemented' }); return; }
    try {
      const customer = await operation.call(customers, scope.context, scope.businessId, customerId);
      res.status(200).json({ customer });
    } catch (error) { sendFailure(res, error); }
  });

  app.get('/api/v1/businesses/:businessId/quotes', authMiddleware, async (req, res) => {
    const scope = businessContext(req, res); if (!scope) return;
    if (!isRegisteredOperation('quote', 'read') || !quotes.listBusinessQuotes) { res.status(501).json({ error: 'not_implemented' }); return; }
    try { res.status(200).json({ quotes: await quotes.listBusinessQuotes(scope.context, scope.businessId) }); }
    catch (error) { sendFailure(res, error); }
  });

  app.post('/api/v1/businesses/:businessId/quotes', authMiddleware, async (req, res) => {
    const scope = businessContext(req, res); if (!scope) return;
    if (!isRegisteredOperation('quote', 'create') || !quotes.createBusinessQuote) { res.status(501).json({ error: 'not_implemented' }); return; }
    const body = req.body as Record<string, unknown>;
    const lineItems = Array.isArray(body?.lineItems) ? body.lineItems : [];
    const validLines = lineItems.length > 0 && lineItems.every(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.description === 'string' && !!item.description.trim() && typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 && typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) && item.unitPrice > 0 && (item.catalogItemId === undefined || item.catalogItemId === null));
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['customerId','lineItems','followUpDate'].includes(k)) || !Number.isSafeInteger(body.customerId) || (body.customerId as number) <= 0 || !validLines || typeof body.followUpDate !== 'string') {
      res.status(400).json({ error: 'invalid_request' }); return;
    }
    try {
      const quote = await quotes.createBusinessQuote(scope.context, scope.businessId, { customerId: body.customerId as number, lineItems: lineItems as Array<{description:string;quantity:number;unitPrice:number;catalogItemId?:number|null}>, followUpDate: body.followUpDate });
      res.status(201).json({ quote });
    } catch (error) { sendFailure(res, error); }
  });

  app.get('/api/v1/businesses/:businessId/quotes/:quoteId', authMiddleware, async (req, res) => {
    const scope = businessContext(req, res); if (!scope) return;
    const quoteId = positiveId(req.params.quoteId);
    if (quoteId === null) { res.status(400).json({ error: 'invalid_request' }); return; }
    if (!quotes.getBusinessQuote) { res.status(501).json({ error: 'not_implemented' }); return; }
    try {
      const quote = await quotes.getBusinessQuote(scope.context, scope.businessId, quoteId);
      if (!quote) { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ quote });
    } catch (error) { sendFailure(res, error); }
  });

  app.patch('/api/v1/businesses/:businessId/quotes/:quoteId', authMiddleware, async (req, res) => {
    const scope = businessContext(req, res); if (!scope) return;
    const quoteId = positiveId(req.params.quoteId);
    const body = req.body as Record<string, unknown>;
    if (quoteId === null || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) { res.status(400).json({ error: 'invalid_request' }); return; }
    try {
      let quote;
      if (Object.keys(body)[0] === 'status' && (body.status === 'active' || body.status === 'won' || body.status === 'lost') && quotes.setBusinessQuoteStatus) {
        quote = await quotes.setBusinessQuoteStatus(scope.context, scope.businessId, quoteId, body.status as QuoteStatus);
      } else if (Object.keys(body)[0] === 'notes' && typeof body.notes === 'string' && quotes.setBusinessQuoteNotes) {
        quote = await quotes.setBusinessQuoteNotes(scope.context, scope.businessId, quoteId, body.notes);
      } else { res.status(400).json({ error: 'invalid_request' }); return; }
      res.status(200).json({ quote });
    } catch (error) { sendFailure(res, error); }
  });
};

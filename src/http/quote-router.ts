import { Express, Request, Response } from 'express';
import { AuthContext } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { canAccessResource } from '../auth/authorization';
import { isRegisteredOperation } from '../resources/registry';
import type { CreateQuoteInput, Quote, QuoteService, QuoteStatus } from '../resources/quote/contracts';

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseCreateQuoteInput = (body: unknown): CreateQuoteInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['customerId', 'lineItems', 'followUpDate']);
  if (Object.keys(input).some(key => !allowed.has(key))) return null;
  if (!Number.isSafeInteger(input.customerId) || (input.customerId as number) <= 0) return null;
  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) return null;
  if (typeof input.followUpDate !== 'string') return null;

  const lineItems = input.lineItems.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const line = item as Record<string, unknown>;
    const lineAllowed = new Set(['description', 'quantity', 'unitPrice', 'catalogItemId']);
    if (Object.keys(line).some(key => !lineAllowed.has(key))) return null;
    if (typeof line.description !== 'string' || !line.description.trim()) return null;
    if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity) || line.quantity <= 0) return null;
    if (typeof line.unitPrice !== 'number' || !Number.isFinite(line.unitPrice) || line.unitPrice <= 0) return null;
    if (Object.hasOwn(line, 'catalogItemId') &&
        line.catalogItemId !== null &&
        (!Number.isSafeInteger(line.catalogItemId) || (line.catalogItemId as number) <= 0)) return null;
    return {
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      ...(Object.hasOwn(line, 'catalogItemId') ? { catalogItemId: line.catalogItemId as number | null } : {}),
    };
  });

  if (lineItems.some(item => item === null)) return null;
  return {
    customerId: input.customerId as number,
    lineItems: lineItems as CreateQuoteInput['lineItems'],
    followUpDate: input.followUpDate,
  };
};

const parseStatusUpdate = (body: unknown): QuoteStatus | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || !Object.hasOwn(input, 'status')) return null;
  return input.status === 'active' || input.status === 'won' || input.status === 'lost'
    ? input.status
    : null;
};

const parseNotesUpdate = (body: unknown): string | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.notes !== 'string') return null;
  return input.notes;
};

const requireQuoteAccess = (operation: 'read' | 'create' | 'update') =>
  (req: Request, res: Response, next: () => void): void => {
    const context = req.authContext as AuthContext | undefined;
    if (!context || !isRegisteredOperation('quote', operation) || !canAccessResource(context, 'quote')) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };

const handleQuoteError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Quote not found or ownership required' || error.message === 'Customer not found or ownership required') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (
      error.message === 'Customer is required' ||
      error.message === 'At least one quote line item is required' ||
      error.message === 'Follow-up date must be YYYY-MM-DD' ||
      error.message.startsWith('Quote line item ') ||
      error.message === 'Quote catalog item reference is invalid' ||
      error.message === 'Quote id is invalid' ||
      error.message === 'Invalid Quote status' ||
      error.message === 'Quote notes must be text'
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

export const registerQuoteRoutes = (app: Express, quoteService: QuoteService): void => {
  app.get('/api/v1/quotes', requireAuth, requireQuoteAccess('read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const quotes = await quoteService.listQuotes(context);
      res.status(200).json({ quotes });
    } catch (error) {
      handleQuoteError(error, res);
    }
  });

  app.get('/api/v1/quotes/:quoteId', requireAuth, requireQuoteAccess('read'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const quoteIdValue = routeParam(req.params.quoteId);
      const quoteId = quoteIdValue === null ? null : positiveIntegerId(quoteIdValue);
      if (quoteId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const quote = await quoteService.getQuote(context, quoteId);
      if (!quote) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      res.status(200).json({ quote });
    } catch (error) {
      handleQuoteError(error, res);
    }
  });

  app.post('/api/v1/quotes', requireAuth, requireQuoteAccess('create'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const input = parseCreateQuoteInput(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const quote = await quoteService.createQuote(context, input);
      res.status(201).json({ quote });
    } catch (error) {
      handleQuoteError(error, res);
    }
  });

  app.patch('/api/v1/quotes/:quoteId', requireAuth, requireQuoteAccess('update'), async (req: Request, res: Response) => {
    try {
      const context = req.authContext as AuthContext;
      const quoteIdValue = routeParam(req.params.quoteId);
      const quoteId = quoteIdValue === null ? null : positiveIntegerId(quoteIdValue);
      if (quoteId === null) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      const keys = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? Object.keys(req.body as Record<string, unknown>)
        : [];
      if (keys.length !== 1) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }

      if (keys[0] === 'status') {
        const status = parseStatusUpdate(req.body);
        if (status === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const quote = await quoteService.setQuoteStatus(context, quoteId, status);
        res.status(200).json({ quote });
        return;
      }

      if (keys[0] === 'notes') {
        const notes = parseNotesUpdate(req.body);
        if (notes === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const quote = await quoteService.setQuoteNotes(context, quoteId, notes);
        res.status(200).json({ quote });
        return;
      }

      res.status(400).json({ error: 'invalid_request' });
    } catch (error) {
      handleQuoteError(error, res);
    }
  });
};

import type { AuthContext } from '../../auth/authorization';
import type {
  CreateQuoteInput,
  Quote,
  QuoteId,
  QuoteRepository,
  QuoteService,
  QuoteStatus,
} from './contracts';

const STATUSES: readonly QuoteStatus[] = ['active', 'won', 'lost'];

const isDateKey = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export class DefaultQuoteService implements QuoteService {
  constructor(private readonly repository: QuoteRepository) {}

  async createQuote(context: AuthContext, input: CreateQuoteInput): Promise<Quote> {
    if (!Number.isSafeInteger(input.customerId) || input.customerId <= 0) {
      throw new Error('Customer is required');
    }
    if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
      throw new Error('At least one quote line item is required');
    }
    if (!isDateKey(input.followUpDate)) {
      throw new Error('Follow-up date must be YYYY-MM-DD');
    }

    const lineItems = input.lineItems.map(item => {
      if (typeof item.description !== 'string' || item.description.trim().length === 0) {
        throw new Error('Quote line item description is required');
      }
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new Error('Quote line item quantity must be greater than zero');
      }
      if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) {
        throw new Error('Quote line item unit price must be greater than zero');
      }
      if (item.catalogItemId !== undefined && item.catalogItemId !== null &&
          (!Number.isSafeInteger(item.catalogItemId) || item.catalogItemId <= 0)) {
        throw new Error('Quote catalog item reference is invalid');
      }
      return {
        ...item,
        description: item.description.trim(),
        catalogItemId: item.catalogItemId ?? null,
      };
    });

    return this.repository.createQuote(context, { ...input, lineItems });
  }

  getQuote(context: AuthContext, quoteId: QuoteId): Promise<Quote | null> {
    return this.repository.getQuote(context, quoteId);
  }

  listQuotes(context: AuthContext): Promise<Quote[]> {
    return this.repository.listQuotes(context);
  }

  async setQuoteStatus(context: AuthContext, quoteId: QuoteId, status: QuoteStatus): Promise<Quote> {
    if (!Number.isSafeInteger(quoteId) || quoteId <= 0) throw new Error('Quote id is invalid');
    if (!STATUSES.includes(status)) throw new Error('Invalid Quote status');
    return this.repository.setQuoteStatus(context, quoteId, status);
  }

  async setQuoteNotes(context: AuthContext, quoteId: QuoteId, notes: string): Promise<Quote> {
    if (!Number.isSafeInteger(quoteId) || quoteId <= 0) throw new Error('Quote id is invalid');
    if (typeof notes !== 'string') throw new Error('Quote notes must be text');
    return this.repository.setQuoteNotes(context, quoteId, notes);
  }
}

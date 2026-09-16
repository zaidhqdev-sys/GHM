import type { AuthContext } from '../../auth/authorization';

export type QuoteId = number;
export type AccountId = number;
export type CustomerId = number;
export type QuoteStatus = 'active' | 'won' | 'lost';

export interface QuoteLineItem {
  readonly id: number;
  readonly quoteId: QuoteId;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly catalogItemId: number | null;
  readonly createdAt: Date;
}

export interface Quote {
  readonly id: QuoteId;
  readonly accountId: AccountId;
  readonly customerId: CustomerId;
  readonly customerName: string;
  readonly customerPhone: string | null;
  readonly customerEmail: string | null;
  readonly description: string;
  readonly amount: number;
  readonly followUpDate: string;
  readonly status: QuoteStatus;
  readonly reminderId: string | null;
  readonly reminderDate: string | null;
  readonly notes: string;
  readonly lineItems: readonly QuoteLineItem[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateQuoteLineItemInput {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly catalogItemId?: number | null;
}

export interface CreateQuoteInput {
  readonly customerId: CustomerId;
  readonly lineItems: readonly CreateQuoteLineItemInput[];
  readonly followUpDate: string;
}

export interface QuoteRepository {
  createQuote(context: AuthContext, input: CreateQuoteInput): Promise<Quote>;
  getQuote(context: AuthContext, quoteId: QuoteId): Promise<Quote | null>;
  listQuotes(context: AuthContext): Promise<Quote[]>;
  setQuoteStatus(context: AuthContext, quoteId: QuoteId, status: QuoteStatus): Promise<Quote>;
  setQuoteNotes(context: AuthContext, quoteId: QuoteId, notes: string): Promise<Quote>;
}

export interface QuoteService {
  createQuote(context: AuthContext, input: CreateQuoteInput): Promise<Quote>;
  getQuote(context: AuthContext, quoteId: QuoteId): Promise<Quote | null>;
  listQuotes(context: AuthContext): Promise<Quote[]>;
  setQuoteStatus(context: AuthContext, quoteId: QuoteId, status: QuoteStatus): Promise<Quote>;
  setQuoteNotes(context: AuthContext, quoteId: QuoteId, notes: string): Promise<Quote>;
}

export const QUOTE_OPERATIONS = Object.freeze({
  read: 'quote.read',
  create: 'quote.create',
  update: 'quote.update',
});

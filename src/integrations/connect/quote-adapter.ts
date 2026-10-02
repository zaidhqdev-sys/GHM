import type { ConnectAuthorizedOperation } from './authorization-binding';
import type {
  CreateQuoteInput,
  CreateQuoteLineItemInput,
  Quote,
  QuoteService,
  QuoteStatus,
} from '../../resources/quote/contracts';

export type ConnectQuoteCapability = 'quote.read' | 'quote.create' | 'quote.update';

export type ConnectQuoteDispatchInput =
  | { readonly capability: 'quote.read'; readonly quoteId?: number }
  | { readonly capability: 'quote.create'; readonly customerId: number; readonly lineItems: readonly CreateQuoteLineItemInput[]; readonly followUpDate: string }
  | { readonly capability: 'quote.update'; readonly quoteId: number; readonly status?: QuoteStatus; readonly notes?: string };

export type ConnectQuoteDispatchResult = Quote | Quote[] | null;

export interface ConnectQuoteAdapterDependencies {
  readonly quotes: QuoteService;
}

export class ConnectQuoteAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectQuoteAdapterError';
  }
}

const assertAuthorizedCapability: (
  authorized: ConnectAuthorizedOperation,
  capability: ConnectQuoteCapability,
) => void = (authorized, capability) => {
  if (!authorized || authorized.capability !== capability || authorized.resource !== 'quote') {
    throw new ConnectQuoteAdapterError('Authorized quote capability does not match request');
  }
  if (authorized.operation !== capability.slice('quote.'.length)) {
    throw new ConnectQuoteAdapterError('Authorized operation does not match capability');
  }
};

const assertPositiveId: (value: unknown) => asserts value is number = (value: unknown): asserts value is number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ConnectQuoteAdapterError('Invalid quote/customer identifier');
  }
};

export const dispatchConnectQuoteCapability = async (
  authorized: ConnectAuthorizedOperation,
  input: ConnectQuoteDispatchInput,
  dependencies: ConnectQuoteAdapterDependencies,
): Promise<ConnectQuoteDispatchResult> => {
  assertAuthorizedCapability(authorized, input.capability);
  switch (input.capability) {
    case 'quote.read':
      if (input.quoteId === undefined) return dependencies.quotes.listQuotes(authorized.context);
      assertPositiveId(input.quoteId);
      return dependencies.quotes.getQuote(authorized.context, input.quoteId);
    case 'quote.create': {
      assertPositiveId(input.customerId);
      const createInput: CreateQuoteInput = {
        customerId: input.customerId,
        lineItems: input.lineItems,
        followUpDate: input.followUpDate,
      };
      return dependencies.quotes.createQuote(authorized.context, createInput);
    }
    case 'quote.update':
      assertPositiveId(input.quoteId);
      if (input.status !== undefined) return dependencies.quotes.setQuoteStatus(authorized.context, input.quoteId, input.status);
      if (input.notes !== undefined) return dependencies.quotes.setQuoteNotes(authorized.context, input.quoteId, input.notes);
      throw new ConnectQuoteAdapterError('Quote update requires status or notes');
    default: {
      const unreachable: never = input;
      throw new ConnectQuoteAdapterError(`Unsupported Connect quote capability: ${String(unreachable)}`);
    }
  }
};

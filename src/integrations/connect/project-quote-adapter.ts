import type { ConnectAuthorizedOperation } from './authorization-binding';
import type {
  CreateProjectQuoteInput,
  ProjectQuote,
  ProjectQuoteService,
  UpdateProjectQuoteInput,
} from '../../resources/project-quote/contracts';

export type ConnectProjectQuoteCapability =
  | 'project_quote.readReceived'
  | 'project_quote.readOwn'
  | 'project_quote.create'
  | 'project_quote.update'
  | 'project_quote.accept'
  | 'project_quote.reject';

export type ConnectProjectQuoteDispatchInput =
  | { readonly capability: 'project_quote.readReceived'; readonly projectId: number }
  | { readonly capability: 'project_quote.readOwn'; readonly businessId: number }
  | { readonly capability: 'project_quote.create'; readonly input: CreateProjectQuoteInput }
  | { readonly capability: 'project_quote.update'; readonly quoteId: number; readonly input: UpdateProjectQuoteInput }
  | { readonly capability: 'project_quote.accept'; readonly quoteId: number }
  | { readonly capability: 'project_quote.reject'; readonly quoteId: number };

export type ConnectProjectQuoteDispatchResult = readonly ProjectQuote[] | ProjectQuote;

export interface ConnectProjectQuoteAdapterDependencies {
  readonly projectQuotes: ProjectQuoteService;
}

export class ConnectProjectQuoteAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectProjectQuoteAdapterError';
  }
}

const assertAuthorized = (
  authorized: ConnectAuthorizedOperation,
  capability: ConnectProjectQuoteCapability,
): void => {
  if (!authorized || authorized.capability !== capability || authorized.resource !== 'project_quote') {
    throw new ConnectProjectQuoteAdapterError('Authorized project quote capability does not match request');
  }
  if (authorized.operation !== capability.slice('project_quote.'.length)) {
    throw new ConnectProjectQuoteAdapterError('Authorized operation does not match capability');
  }
};

const assertPositiveId: (value: unknown, label: string) => asserts value is number =
  (value, label) => {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new ConnectProjectQuoteAdapterError(`Invalid ${label}`);
    }
  };

export const dispatchConnectProjectQuoteCapability = async (
  authorized: ConnectAuthorizedOperation,
  input: ConnectProjectQuoteDispatchInput,
  dependencies: ConnectProjectQuoteAdapterDependencies,
): Promise<ConnectProjectQuoteDispatchResult> => {
  assertAuthorized(authorized, input.capability);

  switch (input.capability) {
    case 'project_quote.readReceived':
      if (authorized.context.role !== 'customer') {
        throw new ConnectProjectQuoteAdapterError('Project quote received read requires customer context');
      }
      assertPositiveId(input.projectId, 'project identifier');
      return dependencies.projectQuotes.readReceived(authorized.context, input.projectId);

    case 'project_quote.readOwn':
      if (authorized.context.role !== 'business') {
        throw new ConnectProjectQuoteAdapterError('Project quote own read requires business context');
      }
      assertPositiveId(input.businessId, 'business identifier');
      return dependencies.projectQuotes.readOwn(authorized.context, input.businessId);

    case 'project_quote.create':
      if (authorized.context.role !== 'business') {
        throw new ConnectProjectQuoteAdapterError('Project quote creation requires business context');
      }
      return dependencies.projectQuotes.create(authorized.context, input.input);

    case 'project_quote.update':
      if (authorized.context.role !== 'business') {
        throw new ConnectProjectQuoteAdapterError('Project quote update requires business context');
      }
      assertPositiveId(input.quoteId, 'project quote identifier');
      return dependencies.projectQuotes.update(authorized.context, input.quoteId, input.input);

    case 'project_quote.accept':
      if (authorized.context.role !== 'customer') {
        throw new ConnectProjectQuoteAdapterError('Project quote acceptance requires customer context');
      }
      assertPositiveId(input.quoteId, 'project quote identifier');
      return dependencies.projectQuotes.accept(authorized.context, input.quoteId);

    case 'project_quote.reject':
      if (authorized.context.role !== 'customer') {
        throw new ConnectProjectQuoteAdapterError('Project quote rejection requires customer context');
      }
      assertPositiveId(input.quoteId, 'project quote identifier');
      return dependencies.projectQuotes.reject(authorized.context, input.quoteId);

    default: {
      const unreachable: never = input;
      throw new ConnectProjectQuoteAdapterError(
        `Unsupported Connect project quote capability: ${String(unreachable)}`,
      );
    }
  }
};

import type { ConnectAuthorizedOperation } from './authorization-binding';
import type {
  CreateOpportunityInput,
  Opportunity,
  OpportunityLifecycleStatus,
  OpportunityPublicProjection,
  OpportunityService,
  UpdateOpportunityInput,
} from '../../resources/opportunity/contracts';

export type ConnectOpportunityCapability =
  | 'opportunity.read'
  | 'opportunity.create'
  | 'opportunity.update'
  | 'opportunity.transition';

export type ConnectOpportunityDispatchInput =
  | { readonly capability: 'opportunity.read'; readonly opportunityId: number }
  | { readonly capability: 'opportunity.create'; readonly input: CreateOpportunityInput }
  | { readonly capability: 'opportunity.update'; readonly opportunityId: number; readonly input: UpdateOpportunityInput }
  | { readonly capability: 'opportunity.transition'; readonly opportunityId: number; readonly nextStatus: OpportunityLifecycleStatus };

export type ConnectOpportunityDispatchResult = Opportunity | OpportunityPublicProjection | null;

export interface ConnectOpportunityAdapterDependencies {
  readonly opportunities: OpportunityService;
}

export class ConnectOpportunityAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectOpportunityAdapterError';
  }
}

const assertAuthorizedCapability: (
  authorized: ConnectAuthorizedOperation,
  capability: ConnectOpportunityCapability,
) => void = (authorized, capability) => {
  if (!authorized || authorized.capability !== capability || authorized.resource !== 'opportunity') {
    throw new ConnectOpportunityAdapterError('Authorized opportunity capability does not match request');
  }
  if (authorized.operation !== capability.slice('opportunity.'.length)) {
    throw new ConnectOpportunityAdapterError('Authorized operation does not match capability');
  }
};

const assertPositiveId: (value: unknown) => asserts value is number = (value: unknown): asserts value is number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ConnectOpportunityAdapterError('Invalid opportunity identifier');
  }
};

export const dispatchConnectOpportunityCapability = async (
  authorized: ConnectAuthorizedOperation,
  input: ConnectOpportunityDispatchInput,
  dependencies: ConnectOpportunityAdapterDependencies,
): Promise<ConnectOpportunityDispatchResult> => {
  assertAuthorizedCapability(authorized, input.capability);
  switch (input.capability) {
    case 'opportunity.read':
      assertPositiveId(input.opportunityId);
      return dependencies.opportunities.getOwnedOpportunity(authorized.context, input.opportunityId);
    case 'opportunity.create':
      return dependencies.opportunities.createOpportunity(authorized.context, input.input);
    case 'opportunity.update':
      assertPositiveId(input.opportunityId);
      return dependencies.opportunities.updateOwnedOpportunity(authorized.context, input.opportunityId, input.input);
    case 'opportunity.transition':
      assertPositiveId(input.opportunityId);
      return dependencies.opportunities.transitionOpportunity(authorized.context, input.opportunityId, input.nextStatus);
    default: {
      const unreachable: never = input;
      throw new ConnectOpportunityAdapterError(
        `Unsupported Connect opportunity capability: ${String(unreachable)}`,
      );
    }
  }
};

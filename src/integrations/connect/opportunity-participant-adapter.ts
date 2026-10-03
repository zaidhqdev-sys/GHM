import type { ConnectAuthorizedOperation } from './authorization-binding';
import type {
  CreateOpportunityParticipantInput,
  OpportunityParticipant,
  OpportunityParticipantService,
  UpdateOpportunityParticipantInput,
} from '../../resources/opportunity-participant/contracts';

export type ConnectOpportunityParticipantCapability =
  | 'opportunity_participant.read'
  | 'opportunity_participant.create'
  | 'opportunity_participant.update';

export type ConnectOpportunityParticipantDispatchInput =
  | { readonly capability: 'opportunity_participant.read'; readonly participantId?: number; readonly opportunityId?: number }
  | { readonly capability: 'opportunity_participant.create'; readonly input: CreateOpportunityParticipantInput }
  | { readonly capability: 'opportunity_participant.update'; readonly participantId: number; readonly input: UpdateOpportunityParticipantInput };

export type ConnectOpportunityParticipantDispatchResult = OpportunityParticipant | OpportunityParticipant[] | null;

export interface ConnectOpportunityParticipantAdapterDependencies {
  readonly opportunityParticipants: OpportunityParticipantService;
}

export class ConnectOpportunityParticipantAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectOpportunityParticipantAdapterError';
  }
}

const assertAuthorizedCapability = (
  authorized: ConnectAuthorizedOperation,
  capability: ConnectOpportunityParticipantCapability,
): void => {
  if (!authorized || authorized.resource !== 'opportunity_participant' || authorized.capability !== capability) {
    throw new ConnectOpportunityParticipantAdapterError('Authorized opportunity participant capability does not match request');
  }
  if (authorized.operation !== capability.slice('opportunity_participant.'.length)) {
    throw new ConnectOpportunityParticipantAdapterError('Authorized operation does not match capability');
  }
};

const assertPositiveId = (value: unknown): asserts value is number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ConnectOpportunityParticipantAdapterError('Invalid opportunity participant identifier');
  }
};

export const dispatchConnectOpportunityParticipantCapability = async (
  authorized: ConnectAuthorizedOperation,
  input: ConnectOpportunityParticipantDispatchInput,
  dependencies: ConnectOpportunityParticipantAdapterDependencies,
): Promise<ConnectOpportunityParticipantDispatchResult> => {
  assertAuthorizedCapability(authorized, input.capability);
  switch (input.capability) {
    case 'opportunity_participant.read':
      if (input.participantId !== undefined) {
        assertPositiveId(input.participantId);
        return dependencies.opportunityParticipants.getParticipant(authorized.context, input.participantId);
      }
      if (input.opportunityId !== undefined) {
        assertPositiveId(input.opportunityId);
        return dependencies.opportunityParticipants.listOpportunityParticipants(authorized.context, input.opportunityId);
      }
      throw new ConnectOpportunityParticipantAdapterError('A participant or opportunity identifier is required');
    case 'opportunity_participant.create':
      return dependencies.opportunityParticipants.createParticipant(authorized.context, input.input);
    case 'opportunity_participant.update':
      assertPositiveId(input.participantId);
      return dependencies.opportunityParticipants.updateParticipant(authorized.context, input.participantId, input.input);
    default: {
      const unreachable: never = input;
      throw new ConnectOpportunityParticipantAdapterError(`Unsupported Connect opportunity participant capability: ${String(unreachable)}`);
    }
  }
};

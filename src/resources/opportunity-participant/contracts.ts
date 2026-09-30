import type { AuthContext } from '../../auth/authorization';

export type OpportunityParticipantId = number;
export type OpportunityId = number;
export type AccountId = number;
export type BusinessId = number;

export type ParticipationRole =
  | 'creator'
  | 'owner'
  | 'recipient'
  | 'responder'
  | 'evaluator'
  | 'fulfiller';

export type ParticipationStatus =
  | 'invited'
  | 'active'
  | 'declined'
  | 'withdrawn'
  | 'removed'
  | 'completed';

export interface OpportunityParticipant {
  readonly id: OpportunityParticipantId;
  readonly opportunityId: OpportunityId;
  readonly accountId: AccountId | null;
  readonly businessId: BusinessId | null;
  readonly participationRole: ParticipationRole;
  readonly participationStatus: ParticipationStatus;
  readonly createdBy: AccountId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateOpportunityParticipantInput {
  readonly opportunityId: OpportunityId;
  readonly accountId?: AccountId | null;
  readonly businessId?: BusinessId | null;
  readonly participationRole: ParticipationRole;
  readonly participationStatus?: ParticipationStatus;
}

export interface UpdateOpportunityParticipantInput {
  readonly participationRole?: ParticipationRole;
  readonly participationStatus?: ParticipationStatus;
}

export interface OpportunityParticipantReadFilter {
  readonly opportunityId?: OpportunityId;
  readonly accountId?: AccountId;
  readonly businessId?: BusinessId;
}

export interface OpportunityParticipantRepository {
  createParticipant(context: AuthContext, input: CreateOpportunityParticipantInput): Promise<OpportunityParticipant>;
  getParticipant(context: AuthContext, participantId: OpportunityParticipantId): Promise<OpportunityParticipant | null>;
  listOpportunityParticipants(context: AuthContext, opportunityId: OpportunityId): Promise<OpportunityParticipant[]>;
  updateParticipant(context: AuthContext, participantId: OpportunityParticipantId, input: UpdateOpportunityParticipantInput): Promise<OpportunityParticipant>;
}

export interface OpportunityParticipantService {
  createParticipant(context: AuthContext, input: CreateOpportunityParticipantInput): Promise<OpportunityParticipant>;
  getParticipant(context: AuthContext, participantId: OpportunityParticipantId): Promise<OpportunityParticipant | null>;
  listOpportunityParticipants(context: AuthContext, opportunityId: OpportunityId): Promise<OpportunityParticipant[]>;
  updateParticipant(context: AuthContext, participantId: OpportunityParticipantId, input: UpdateOpportunityParticipantInput): Promise<OpportunityParticipant>;
}

export const OPPORTUNITY_PARTICIPANT_OPERATIONS = Object.freeze({
  read: 'opportunity_participant.read',
  create: 'opportunity_participant.create',
  update: 'opportunity_participant.update',
});

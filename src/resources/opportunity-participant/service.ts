import type { AuthContext } from '../../auth/authorization';
import type {
  CreateOpportunityParticipantInput,
  OpportunityParticipant,
  OpportunityParticipantId,
  OpportunityParticipantRepository,
  OpportunityParticipantService,
  UpdateOpportunityParticipantInput,
} from './contracts';

const validateCreate = (input: CreateOpportunityParticipantInput): CreateOpportunityParticipantInput => {
  if (!input || typeof input !== 'object') throw new Error('Opportunity participant input is required');
  return input;
};

export class OpportunityParticipantServiceImpl implements OpportunityParticipantService {
  constructor(private readonly repository: OpportunityParticipantRepository) {}

  async createParticipant(context: AuthContext, input: CreateOpportunityParticipantInput): Promise<OpportunityParticipant> {
    return this.repository.createParticipant(context, validateCreate(input));
  }

  async getParticipant(context: AuthContext, participantId: OpportunityParticipantId): Promise<OpportunityParticipant | null> {
    return this.repository.getParticipant(context, participantId);
  }

  async listOpportunityParticipants(context: AuthContext, opportunityId: number): Promise<OpportunityParticipant[]> {
    return this.repository.listOpportunityParticipants(context, opportunityId);
  }

  async updateParticipant(context: AuthContext, participantId: OpportunityParticipantId, input: UpdateOpportunityParticipantInput): Promise<OpportunityParticipant> {
    return this.repository.updateParticipant(context, participantId, input);
  }
}

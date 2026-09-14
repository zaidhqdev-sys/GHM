import type { AuthContext } from '../../auth/authorization';
import type { CreateOpportunityInput, Opportunity, OpportunityRepository, OpportunityService, UpdateOpportunityInput } from './contracts';

const validate = (input: CreateOpportunityInput): CreateOpportunityInput => {
  if (!input || typeof input !== 'object') throw new Error('Opportunity input is required');
  return input;
};

export class OpportunityServiceImpl implements OpportunityService {
  constructor(private readonly repository: OpportunityRepository) {}

  async createOpportunity(context: AuthContext, input: CreateOpportunityInput): Promise<Opportunity> {
    return this.repository.createOpportunity(context, validate(input));
  }

  async getOpportunity(context: AuthContext, opportunityId: number): Promise<Opportunity | null> {
    return this.repository.getOpportunity(context, opportunityId);
  }

  async getOwnedOpportunity(context: AuthContext, opportunityId: number): Promise<Opportunity | null> {
    return this.repository.getOwnedOpportunity(context, opportunityId);
  }

  async updateOwnedOpportunity(context: AuthContext, opportunityId: number, input: UpdateOpportunityInput): Promise<Opportunity> {
    return this.repository.updateOwnedOpportunity(context, opportunityId, input);
  }
}
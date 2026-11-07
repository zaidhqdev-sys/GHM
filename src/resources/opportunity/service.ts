import type { AuthContext } from '../../auth/authorization';
import type { CreateOpportunityInput, Opportunity, OpportunityLifecycleStatus, OpportunityPublicProjection, OpportunityRepository, OpportunityService, UpdateOpportunityInput } from './contracts';

const validate = (input: CreateOpportunityInput): CreateOpportunityInput => {
  if (!input || typeof input !== 'object') throw new Error('Opportunity input is required');
  return input;
};

export class OpportunityServiceImpl implements OpportunityService {
  constructor(private readonly repository: OpportunityRepository) {}

  async createOpportunity(context: AuthContext, input: CreateOpportunityInput): Promise<Opportunity> {
    return this.repository.createOpportunity(context, validate(input));
  }

  async getOpportunity(context: AuthContext, opportunityId: number): Promise<Opportunity | OpportunityPublicProjection | null> {
    return this.repository.getOpportunity(context, opportunityId);
  }

  async getOwnedOpportunity(context: AuthContext, opportunityId: number): Promise<Opportunity | null> {
    return this.repository.getOwnedOpportunity(context, opportunityId);
  }

  async updateOwnedOpportunity(context: AuthContext, opportunityId: number, input: UpdateOpportunityInput): Promise<Opportunity> {
    return this.repository.updateOwnedOpportunity(context, opportunityId, input);
  }

  async transitionOpportunity(context: AuthContext, opportunityId: number, nextStatus: OpportunityLifecycleStatus): Promise<Opportunity> {
    return this.repository.transitionOpportunity(context, opportunityId, nextStatus);
  }
  async listMarketplaceOpportunities(context: AuthContext, input: import('./contracts').OpportunityMarketplaceInput): Promise<import('./contracts').OpportunityMarketplacePage> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new Error('Invalid Opportunity page limit');
    if (!Number.isSafeInteger(input.offset) || input.offset < 0) throw new Error('Invalid Opportunity page offset');
    if (input.search !== undefined && (typeof input.search !== 'string' || input.search.trim().length > 120)) throw new Error('Invalid Opportunity search filter');
    if (input.opportunityTypeId !== undefined && (!Number.isSafeInteger(input.opportunityTypeId) || input.opportunityTypeId <= 0)) throw new Error('Invalid Opportunity type filter');
    return this.repository.listMarketplaceOpportunities(context, { ...input, ...(input.search !== undefined ? { search: input.search.normalize('NFKC').trim().slice(0,120) || undefined } : {}) });
  }

  async listOpportunityTypes(context: AuthContext): Promise<readonly import('./contracts').OpportunityType[]> {
    return this.repository.listOpportunityTypes(context);
  }
}

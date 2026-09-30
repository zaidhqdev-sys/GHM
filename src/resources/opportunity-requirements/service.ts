import type { AuthContext } from '../../auth/authorization';
import type {
  OpportunityCapabilityRequirement,
  OpportunityRequirementsRepository,
  OpportunityRequirementsService,
  ReplaceOpportunityCapabilityRequirementInput,
} from './contracts';
import type { OpportunityId } from '../opportunity/contracts';

export class OpportunityRequirementsServiceImpl
  implements OpportunityRequirementsService
{
  constructor(
    private readonly repository: OpportunityRequirementsRepository,
  ) {}

  async listOpportunityRequirements(
    context: AuthContext,
    opportunityId: OpportunityId,
  ): Promise<readonly OpportunityCapabilityRequirement[]> {
    return this.repository.listOpportunityRequirements(
      context,
      opportunityId,
    );
  }

  async replaceOpportunityRequirements(
    context: AuthContext,
    opportunityId: OpportunityId,
    requirements: readonly ReplaceOpportunityCapabilityRequirementInput[],
  ): Promise<readonly OpportunityCapabilityRequirement[]> {
    return this.repository.replaceOpportunityRequirements(
      context,
      opportunityId,
      requirements,
    );
  }
}

import type { AuthContext } from '../../auth/authorization';
import type {
  OpportunityId,
} from '../opportunity/contracts';

export type OpportunityRequirementImportance = 'required' | 'preferred';

export type OpportunityRequirementProficiency =
  | 'foundational'
  | 'proficient'
  | 'advanced'
  | 'expert';

export interface OpportunityCapabilityRequirement {
  readonly id: number;
  readonly opportunityId: OpportunityId;
  readonly capabilityId: string;
  readonly importance: OpportunityRequirementImportance;
  readonly minimumProficiencyLevel: OpportunityRequirementProficiency | null;
  readonly description: string | null;
  readonly sortOrder: number;
}

export interface ReplaceOpportunityCapabilityRequirementInput {
  readonly capabilityId: string;
  readonly importance?: OpportunityRequirementImportance;
  readonly minimumProficiencyLevel?: OpportunityRequirementProficiency | null;
  readonly description?: string | null;
  readonly sortOrder?: number;
}

export interface OpportunityRequirementsRepository {
  listOpportunityRequirements(
    context: AuthContext,
    opportunityId: OpportunityId,
  ): Promise<readonly OpportunityCapabilityRequirement[]>;

  replaceOpportunityRequirements(
    context: AuthContext,
    opportunityId: OpportunityId,
    requirements: readonly ReplaceOpportunityCapabilityRequirementInput[],
  ): Promise<readonly OpportunityCapabilityRequirement[]>;
}

export interface OpportunityRequirementsService {
  listOpportunityRequirements(
    context: AuthContext,
    opportunityId: OpportunityId,
  ): Promise<readonly OpportunityCapabilityRequirement[]>;

  replaceOpportunityRequirements(
    context: AuthContext,
    opportunityId: OpportunityId,
    requirements: readonly ReplaceOpportunityCapabilityRequirementInput[],
  ): Promise<readonly OpportunityCapabilityRequirement[]>;
}

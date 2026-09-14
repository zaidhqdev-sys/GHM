import type { AuthContext } from '../../auth/authorization';

export type OpportunityId = number;
export type OpportunityTypeId = number;
export type AccountId = number;
export type BusinessId = number;
export type CountryId = number;
export type CurrencyId = number;
export type OpportunityLifecycleStatus = 'draft' | 'open' | 'responding' | 'evaluating' | 'awarded' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
export type OpportunityVisibility = 'private' | 'participants' | 'authenticated' | 'public';

export interface Opportunity {
  readonly id: OpportunityId;
  readonly opportunityTypeId: OpportunityTypeId;
  readonly creatorAccountId: AccountId;
  readonly ownerBusinessId: BusinessId | null;
  readonly countryId: CountryId | null;
  readonly currencyId: CurrencyId | null;
  readonly title: string;
  readonly description: string;
  readonly lifecycleStatus: OpportunityLifecycleStatus;
  readonly visibility: OpportunityVisibility;
  readonly budgetMin: number | null;
  readonly budgetMax: number | null;
  readonly opensAt: Date | null;
  readonly closesAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateOpportunityInput {
  readonly opportunityTypeId: OpportunityTypeId;
  readonly ownerBusinessId?: BusinessId | null;
  readonly countryId?: CountryId | null;
  readonly currencyId?: CurrencyId | null;
  readonly title: string;
  readonly description: string;
  readonly visibility?: OpportunityVisibility;
  readonly budgetMin?: number | null;
  readonly budgetMax?: number | null;
  readonly opensAt?: Date | null;
  readonly closesAt?: Date | null;
}

export interface UpdateOpportunityInput {
  readonly opportunityTypeId?: OpportunityTypeId;
  readonly ownerBusinessId?: BusinessId | null;
  readonly countryId?: CountryId | null;
  readonly currencyId?: CurrencyId | null;
  readonly title?: string;
  readonly description?: string;
  readonly visibility?: OpportunityVisibility;
  readonly budgetMin?: number | null;
  readonly budgetMax?: number | null;
  readonly opensAt?: Date | null;
  readonly closesAt?: Date | null;
}

export interface OpportunityRepository {
  createOpportunity(context: AuthContext, input: CreateOpportunityInput): Promise<Opportunity>;
  getOpportunity(context: AuthContext, opportunityId: OpportunityId): Promise<Opportunity | null>;
  getOwnedOpportunity(context: AuthContext, opportunityId: OpportunityId): Promise<Opportunity | null>;
  updateOwnedOpportunity(context: AuthContext, opportunityId: OpportunityId, input: UpdateOpportunityInput): Promise<Opportunity>;
  transitionOpportunity(context: AuthContext, opportunityId: OpportunityId, nextStatus: OpportunityLifecycleStatus): Promise<Opportunity>;
}

export interface OpportunityService {
  createOpportunity(context: AuthContext, input: CreateOpportunityInput): Promise<Opportunity>;
  getOpportunity(context: AuthContext, opportunityId: OpportunityId): Promise<Opportunity | null>;
  getOwnedOpportunity(context: AuthContext, opportunityId: OpportunityId): Promise<Opportunity | null>;
  updateOwnedOpportunity(context: AuthContext, opportunityId: OpportunityId, input: UpdateOpportunityInput): Promise<Opportunity>;
  transitionOpportunity(context: AuthContext, opportunityId: OpportunityId, nextStatus: OpportunityLifecycleStatus): Promise<Opportunity>;
}

export const OPPORTUNITY_OPERATIONS = Object.freeze({ read: 'opportunity.read', create: 'opportunity.create', update: 'opportunity.update', transition: 'opportunity.transition' });

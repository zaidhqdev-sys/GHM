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
  readonly id: OpportunityId; readonly opportunityTypeId: OpportunityTypeId; readonly creatorAccountId: AccountId;
  readonly ownerBusinessId: BusinessId | null; readonly countryId: CountryId | null; readonly currencyId: CurrencyId | null;
  readonly title: string; readonly description: string; readonly lifecycleStatus: OpportunityLifecycleStatus;
  readonly visibility: OpportunityVisibility; readonly budgetMin: number | null; readonly budgetMax: number | null;
  readonly opensAt: Date | null; readonly closesAt: Date | null; readonly createdAt: Date; readonly updatedAt: Date;
}
export interface OpportunityPublicProjection {
  readonly id: OpportunityId; readonly opportunityTypeId: OpportunityTypeId; readonly countryId: CountryId | null;
  readonly currencyId: CurrencyId | null; readonly title: string; readonly description: string;
  readonly lifecycleStatus: OpportunityLifecycleStatus; readonly visibility: OpportunityVisibility;
  readonly budgetMin: number | null; readonly budgetMax: number | null; readonly opensAt: Date | null;
  readonly closesAt: Date | null; readonly createdAt: Date;
}
export interface OpportunityType { readonly id:number; readonly code:string; readonly name:string; readonly description:string|null; readonly sortOrder:number; }
export interface OpportunityMarketplaceItem extends OpportunityPublicProjection {
  readonly opportunityTypes: Pick<OpportunityType,'id'|'code'|'name'>;
  readonly countries: {readonly id:number;readonly code:string;readonly name:string}|null;
  readonly currencies: {readonly id:number;readonly code:string;readonly symbol:string|null;readonly name:string}|null;
  readonly opportunityCapabilityRequirements: readonly {readonly id:number;readonly capabilityId:string;readonly importance:'required'|'preferred';readonly minimumProficiencyLevel:'foundational'|'proficient'|'advanced'|'expert'|null;readonly description:string|null;readonly sortOrder:number;readonly capabilities:{readonly id:string;readonly name:string;readonly slug:string}|null}[];
}
export interface OpportunityMarketplaceInput { readonly search?:string; readonly opportunityTypeId?:number; readonly limit:number; readonly offset:number; }
export interface OpportunityMarketplacePage { readonly opportunities:readonly OpportunityMarketplaceItem[]; readonly total:number; readonly limit:number; readonly offset:number; }
export interface CreateOpportunityInput { readonly opportunityTypeId:OpportunityTypeId; readonly ownerBusinessId?:BusinessId|null; readonly countryId?:CountryId|null; readonly currencyId?:CurrencyId|null; readonly title:string; readonly description:string; readonly visibility?:OpportunityVisibility; readonly budgetMin?:number|null; readonly budgetMax?:number|null; readonly opensAt?:Date|null; readonly closesAt?:Date|null; }
export interface UpdateOpportunityInput { readonly opportunityTypeId?:OpportunityTypeId; readonly ownerBusinessId?:BusinessId|null; readonly countryId?:CountryId|null; readonly currencyId?:CurrencyId|null; readonly title?:string; readonly description?:string; readonly visibility?:OpportunityVisibility; readonly budgetMin?:number|null; readonly budgetMax?:number|null; readonly opensAt?:Date|null; readonly closesAt?:Date|null; }
export interface OpportunityRepository {
 createOpportunity(context:AuthContext,input:CreateOpportunityInput):Promise<Opportunity>;
 getOpportunity(context:AuthContext,opportunityId:OpportunityId):Promise<Opportunity|OpportunityPublicProjection|null>;
 getOwnedOpportunity(context:AuthContext,opportunityId:OpportunityId):Promise<Opportunity|null>;
 updateOwnedOpportunity(context:AuthContext,opportunityId:OpportunityId,input:UpdateOpportunityInput):Promise<Opportunity>;
 transitionOpportunity(context:AuthContext,opportunityId:OpportunityId,nextStatus:OpportunityLifecycleStatus):Promise<Opportunity>;
 listMarketplaceOpportunities(context:AuthContext,input:OpportunityMarketplaceInput):Promise<OpportunityMarketplacePage>;
 listOpportunityTypes(context:AuthContext):Promise<readonly OpportunityType[]>;
}
export interface OpportunityService extends OpportunityRepository {}
export const OPPORTUNITY_OPERATIONS = Object.freeze({ read:'opportunity.read', create:'opportunity.create', update:'opportunity.update', transition:'opportunity.transition' });

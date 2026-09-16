import type { AuthContext } from '../../auth/authorization';

export type BusinessCapabilityId = number;
export type BusinessId = number;
export type CapabilityId = string;
export type AccountId = number;

export type BusinessCapabilityProficiency =
  | 'foundational'
  | 'proficient'
  | 'advanced'
  | 'expert';

export type BusinessCapabilityAssertionStatus = 'active' | 'withdrawn';
export type BusinessCapabilityAssertionBasis =
  | 'self_declared'
  | 'documented'
  | 'observed'
  | 'third_party_attested';
export type BusinessCapabilityVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'revoked'
  | 'expired';

export interface BusinessCapability {
  readonly id: BusinessCapabilityId;
  readonly businessId: BusinessId;
  readonly capabilityId: CapabilityId;
  readonly proficiencyLevel: BusinessCapabilityProficiency | null;
  readonly description: string | null;
  readonly assertionStatus: BusinessCapabilityAssertionStatus;
  readonly assertionBasis: BusinessCapabilityAssertionBasis;
  readonly verificationStatus: BusinessCapabilityVerificationStatus;
  readonly effectiveFrom: Date;
  readonly effectiveUntil: Date | null;
  readonly sourceReference: string | null;
  readonly submittedAt: Date;
  readonly verifiedBy: AccountId | null;
  readonly verifiedAt: Date | null;
  readonly verificationReason: string | null;
  readonly createdBy: AccountId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateBusinessCapabilityInput {
  readonly businessId: BusinessId;
  readonly capabilityId: CapabilityId;
  readonly proficiencyLevel?: BusinessCapabilityProficiency | null;
  readonly description?: string | null;
  readonly assertionStatus?: BusinessCapabilityAssertionStatus;
  readonly assertionBasis?: BusinessCapabilityAssertionBasis;
  readonly verificationStatus?: BusinessCapabilityVerificationStatus;
  readonly effectiveFrom?: Date;
  readonly effectiveUntil?: Date | null;
  readonly sourceReference?: string | null;
  readonly submittedAt?: Date;
  readonly verifiedBy?: AccountId | null;
  readonly verifiedAt?: Date | null;
  readonly verificationReason?: string | null;
}

export interface BusinessCapabilityRepository {
  createBusinessCapability(context: AuthContext, input: CreateBusinessCapabilityInput): Promise<BusinessCapability>;
  getBusinessCapability(context: AuthContext, businessCapabilityId: BusinessCapabilityId): Promise<BusinessCapability | null>;
  listBusinessCapabilities(context: AuthContext, businessId: BusinessId): Promise<BusinessCapability[]>;
}

export interface BusinessCapabilityService extends BusinessCapabilityRepository {}

export const BUSINESS_CAPABILITY_OPERATIONS = Object.freeze({
  read: 'business_capability.read',
  create: 'business_capability.create',
});

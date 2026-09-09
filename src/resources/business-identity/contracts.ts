import type { AuthContext, GhmRole } from '../../auth/authorization';

export type BusinessId = number;
export type AccountId = number;
export type MembershipId = number;

export type BusinessVerificationStatus = 'pending' | 'approved' | 'rejected';
export type MembershipRole = 'owner' | 'administrator' | 'member';
export type MembershipStatus = 'active' | 'inactive' | 'revoked';

export interface AccountIdentity {
  readonly id: AccountId;
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly avatarRef: string | null;
  readonly role: GhmRole;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BusinessIdentity {
  readonly id: BusinessId;
  readonly name: string;
  readonly slug: string;
  readonly verificationStatus: BusinessVerificationStatus;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BusinessMembership {
  readonly id: MembershipId;
  readonly businessId: BusinessId;
  readonly accountId: AccountId;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
  readonly createdBy: AccountId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApplicationIdentity {
  readonly account: AccountIdentity;
  readonly memberships: readonly BusinessMembership[];
  readonly activeMembership: BusinessMembership | null;
  readonly activeBusiness: BusinessIdentity | null;
}

export interface ResolveIdentityInput {
  readonly context: AuthContext;
  readonly selectedBusinessId?: BusinessId;
}

export interface UpdateProfileInput {
  readonly fullName?: string | null;
  readonly phone?: string | null;
  readonly avatarRef?: string | null;
}

export interface CreateBusinessInput {
  readonly name: string;
}

export interface UpdateBusinessProfileInput {
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly province?: string | null;
  readonly city?: string | null;
  readonly physicalAddress?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly phone?: string | null;
  readonly whatsapp?: string | null;
  readonly email?: string | null;
  readonly website?: string | null;
  readonly avatarLetter?: string | null;
  readonly avatarColor?: string | null;
  readonly yearsInBusiness?: number | null;
}

export interface BusinessIdentityRepository {
  getAccount(context: AuthContext): Promise<AccountIdentity>;
  updateAccount(context: AuthContext, input: UpdateProfileInput): Promise<AccountIdentity>;
  getBusinessById(context: AuthContext, businessId: BusinessId): Promise<BusinessIdentity | null>;
  getBusinessBySlug(context: AuthContext, slug: string): Promise<BusinessIdentity | null>;
  getMembershipsForAccount(context: AuthContext): Promise<readonly BusinessMembership[]>;
  createBusiness(context: AuthContext, input: CreateBusinessInput, slug: string): Promise<BusinessIdentity>;
  updateBusiness(context: AuthContext, businessId: BusinessId, input: UpdateBusinessProfileInput): Promise<BusinessIdentity>;
}

export interface BusinessIdentityService {
  resolveIdentity(input: ResolveIdentityInput): Promise<ApplicationIdentity>;
  getOwnProfile(context: AuthContext): Promise<AccountIdentity>;
  updateOwnProfile(context: AuthContext, input: UpdateProfileInput): Promise<AccountIdentity>;
  createBusiness(context: AuthContext, input: CreateBusinessInput): Promise<ApplicationIdentity>;
  getBusiness(context: AuthContext, businessId: BusinessId): Promise<BusinessIdentity | null>;
  getBusinessBySlug(context: AuthContext, slug: string): Promise<BusinessIdentity | null>;
  updateBusiness(context: AuthContext, businessId: BusinessId, input: UpdateBusinessProfileInput): Promise<BusinessIdentity>;
}

export const BUSINESS_IDENTITY_OPERATIONS = Object.freeze({
  resolveIdentity: 'identity.resolve',
  readProfile: 'profile.readSelf',
  updateProfile: 'profile.updateSelf',
  listMemberships: 'businessContext.listMemberships',
  readBusinessPublic: 'business.readPublic',
  readBusinessManaged: 'business.readManaged',
  createBusiness: 'business.create',
  updateBusiness: 'business.updateProfile',
});

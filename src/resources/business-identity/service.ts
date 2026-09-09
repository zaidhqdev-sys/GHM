import type {
  AccountIdentity,
  ApplicationIdentity,
  BusinessIdentity,
  BusinessIdentityRepository,
  CreateBusinessInput,
  ResolveIdentityInput,
  UpdateBusinessProfileInput,
  UpdateProfileInput,
} from './contracts';
import type { AuthContext } from '../../auth/authorization';
import { createBusinessSlug } from './slug';

const BUSINESS_OPERATOR_ROLES = new Set(['admin', 'business']);

export class BusinessIdentityServiceImpl {
  constructor(private readonly repository: BusinessIdentityRepository) {}

  async resolveIdentity(input: ResolveIdentityInput): Promise<ApplicationIdentity> {
    const account = await this.repository.getAccount(input.context);
    const memberships = await this.repository.getMembershipsForAccount(input.context);
    if (input.selectedBusinessId === undefined) {
      return { account, memberships, activeMembership: null, activeBusiness: null };
    }
    const membership = memberships.find(c => c.businessId === input.selectedBusinessId && c.status === 'active');
    if (!membership) throw new Error('Selected business context is not authorized');
    const business = await this.repository.getBusinessById(input.context, input.selectedBusinessId);
    if (!business) throw new Error('Selected business not found');
    if (!business.isActive) throw new Error('Selected business is inactive');
    return { account, memberships, activeMembership: membership, activeBusiness: business };
  }

  async getOwnProfile(context: AuthContext): Promise<AccountIdentity> { return this.repository.getAccount(context); }
  async updateOwnProfile(context: AuthContext, input: UpdateProfileInput): Promise<AccountIdentity> { return this.repository.updateAccount(context, input); }

  async createBusiness(context: AuthContext, input: CreateBusinessInput): Promise<ApplicationIdentity> {
    if (!BUSINESS_OPERATOR_ROLES.has(context.role)) throw new Error('Business creation requires a business operator role');
    const memberships = await this.repository.getMembershipsForAccount(context);
    if (memberships.some(membership => membership.status === 'active')) {
      throw new Error('Business creation requires no existing active business membership');
    }
    const business = await this.repository.createBusiness(context, input, createBusinessSlug(input.name));
    return this.resolveIdentity({ context, selectedBusinessId: business.id });
  }

  async getPublicBusiness(context: AuthContext, businessId: number): Promise<BusinessIdentity | null> {
    const business = await this.repository.getBusinessById(context, businessId);
    if (!business || !business.isActive || business.verificationStatus !== 'approved') return null;
    return business;
  }

  async getPublicBusinessBySlug(context: AuthContext, slug: string): Promise<BusinessIdentity | null> {
    const business = await this.repository.getBusinessBySlug(context, slug.trim());
    if (!business || !business.isActive || business.verificationStatus !== 'approved') return null;
    return business;
  }

  async getManagedBusiness(context: AuthContext, businessId: number): Promise<BusinessIdentity | null> {
    const memberships = await this.repository.getMembershipsForAccount(context);
    const membership = memberships.find(c => c.businessId === businessId && c.status === 'active' && (c.role === 'owner' || c.role === 'administrator'));
    if (!membership) throw new Error('Business management permission required');
    return this.repository.getBusinessById(context, businessId);
  }

  async updateBusiness(context: AuthContext, businessId: number, input: UpdateBusinessProfileInput): Promise<BusinessIdentity> {
    return this.repository.updateBusiness(context, businessId, input);
  }
}

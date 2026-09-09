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
import { createBusinessSlug } from './repository';

export class BusinessIdentityServiceImpl {
  constructor(private readonly repository: BusinessIdentityRepository) {}

  async resolveIdentity(input: ResolveIdentityInput): Promise<ApplicationIdentity> {
    const account = await this.repository.getAccount(input.context);
    const memberships = await this.repository.getMembershipsForAccount(input.context);

    if (input.selectedBusinessId === undefined) {
      return { account, memberships, activeMembership: null, activeBusiness: null };
    }

    const membership = memberships.find(
      (candidate) =>
        candidate.businessId === input.selectedBusinessId && candidate.status === 'active',
    );
    if (!membership) throw new Error('Selected business context is not authorized');

    const business = await this.repository.getBusinessById(input.context, input.selectedBusinessId);
    if (!business) throw new Error('Selected business not found');
    if (!business.isActive) throw new Error('Selected business is inactive');

    return {
      account,
      memberships,
      activeMembership: membership,
      activeBusiness: business,
    };
  }

  async getOwnProfile(context: AuthContext): Promise<AccountIdentity> {
    return this.repository.getAccount(context);
  }

  async updateOwnProfile(context: AuthContext, input: UpdateProfileInput): Promise<AccountIdentity> {
    return this.repository.updateAccount(context, input);
  }

  async createBusiness(context: AuthContext, input: CreateBusinessInput): Promise<ApplicationIdentity> {
    const business = await this.repository.createBusiness(context, input, createBusinessSlug(input.name));
    return this.resolveIdentity({ context, selectedBusinessId: business.id });
  }

  async getBusiness(context: AuthContext, businessId: number): Promise<BusinessIdentity | null> {
    return this.repository.getBusinessById(context, businessId);
  }

  async getBusinessBySlug(context: AuthContext, slug: string): Promise<BusinessIdentity | null> {
    return this.repository.getBusinessBySlug(context, slug.trim());
  }

  async updateBusiness(
    context: AuthContext,
    businessId: number,
    input: UpdateBusinessProfileInput,
  ): Promise<BusinessIdentity> {
    return this.repository.updateBusiness(context, businessId, input);
  }
}

export type BusinessMigrationProvisioningOutcome = 'created' | 'already_provisioned' | 'conflict' | 'blocked';

export interface BusinessMigrationProvisioningRequest {
  sourceProvider: 'supabase';
  sourceOrganizationId: string;
  businessName: string;
  businessSlug: string;
  ownerAccountId: number;
}

export interface BusinessMigrationProvisioningResult {
  outcome: BusinessMigrationProvisioningOutcome;
  businessId: number | null;
  ownerMembershipId: number | null;
  reasonCode: string;
}

export interface BusinessMigrationProvisioningStore {
  provisionBusinessWithOwnerAndMapping(input: {
    sourceProvider: 'supabase';
    sourceOrganizationId: string;
    businessName: string;
    businessSlug: string;
    ownerAccountId: number;
  }): Promise<BusinessMigrationProvisioningResult>;
}

const requiredText = (value: string, field: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(field + ' must be non-blank');
  return normalized;
};

export const createBusinessMigrationProvisioningService = (
  store: BusinessMigrationProvisioningStore,
) => ({
  async provision(input: BusinessMigrationProvisioningRequest): Promise<BusinessMigrationProvisioningResult> {
    if (input.sourceProvider !== 'supabase') {
      return { outcome: 'blocked', businessId: null, ownerMembershipId: null, reasonCode: 'SOURCE_PROVIDER_NOT_ALLOWED' };
    }

    const sourceOrganizationId = requiredText(input.sourceOrganizationId, 'sourceOrganizationId');
    const businessName = requiredText(input.businessName, 'businessName');
    const businessSlug = requiredText(input.businessSlug, 'businessSlug');

    if (!Number.isSafeInteger(input.ownerAccountId) || input.ownerAccountId <= 0) {
      return { outcome: 'blocked', businessId: null, ownerMembershipId: null, reasonCode: 'OWNER_ACCOUNT_INVALID' };
    }

    return store.provisionBusinessWithOwnerAndMapping({
      sourceProvider: 'supabase',
      sourceOrganizationId,
      businessName,
      businessSlug,
      ownerAccountId: input.ownerAccountId,
    });
  },
});

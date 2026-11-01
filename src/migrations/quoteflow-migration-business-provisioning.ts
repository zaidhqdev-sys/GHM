import type { PoolClient } from 'pg';

export type BusinessMigrationProvisioningOutcome = 'created' | 'already_provisioned' | 'conflict' | 'blocked';

export interface BusinessMigrationProvisioningRequest {
  sourceProvider: 'supabase';
  sourceOrganizationId: string;
  businessName: string;
  businessSlug: string;
  ownerAccountId: number;
  evidenceReference: string;
  reviewedBy: string;
  reviewedAt: Date;
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
    evidenceReference: string;
    reviewedBy: string;
    reviewedAt: string;
  }): Promise<BusinessMigrationProvisioningResult>;
}

/**
 * Adapter for an explicitly supplied migration connection.
 * The caller must own the transaction and connect as ghm_migrator with
 * SET LOCAL ROLE ghm_schema_owner. Never pass the application runtime pool.
 */
export const createPostgresBusinessMigrationProvisioningStore = (
  client: Pick<PoolClient, 'query'>,
): BusinessMigrationProvisioningStore => ({
  async provisionBusinessWithOwnerAndMapping(input) {
    const result = await client.query<{
      outcome: BusinessMigrationProvisioningOutcome;
      business_id: string | number | null;
      owner_membership_id: string | number | null;
      reason_code: string;
    }>(
      `SELECT outcome, business_id, owner_membership_id, reason_code
         FROM ghm.auth_provision_quoteflow_migration_business($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.sourceProvider,
        input.sourceOrganizationId,
        input.businessName,
        input.businessSlug,
        input.ownerAccountId,
        input.evidenceReference,
        input.reviewedBy,
        input.reviewedAt,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Business migration provisioning returned no outcome');
    if (!['created', 'already_provisioned', 'conflict', 'blocked'].includes(row.outcome)) {
      throw new Error('Business migration provisioning returned an unknown outcome');
    }
    return {
      outcome: row.outcome,
      businessId: row.business_id === null ? null : Number(row.business_id),
      ownerMembershipId: row.owner_membership_id === null ? null : Number(row.owner_membership_id),
      reasonCode: row.reason_code,
    };
  },
});

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
    const evidenceReference = requiredText(input.evidenceReference, 'evidenceReference');
    const reviewedBy = requiredText(input.reviewedBy, 'reviewedBy');

    if (!Number.isSafeInteger(input.ownerAccountId) || input.ownerAccountId <= 0) {
      return { outcome: 'blocked', businessId: null, ownerMembershipId: null, reasonCode: 'OWNER_ACCOUNT_INVALID' };
    }
    if (!(input.reviewedAt instanceof Date) || !Number.isFinite(input.reviewedAt.getTime())) {
      return { outcome: 'blocked', businessId: null, ownerMembershipId: null, reasonCode: 'REVIEW_TIMESTAMP_INVALID' };
    }

    return store.provisionBusinessWithOwnerAndMapping({
      sourceProvider: 'supabase',
      sourceOrganizationId,
      businessName,
      businessSlug,
      ownerAccountId: input.ownerAccountId,
      evidenceReference,
      reviewedBy,
      reviewedAt: input.reviewedAt.toISOString(),
    });
  },
});

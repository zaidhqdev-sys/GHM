import type { PoolClient } from 'pg';
import { assertRole, requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import {
  createBusinessInTransaction,
  createBusinessSlug,
} from '../../resources/business-identity/repository';
import type { BusinessIdentity, CreateBusinessInput } from '../../resources/business-identity/contracts';
import {
  EXTERNAL_IDENTITY_PROVIDER_SUPABASE,
  type BusinessExternalMapping,
} from '../../auth/foundation/types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ConnectBusinessProvisioningOutcome =
  | 'resolved'
  | 'provisioned';

export interface ConnectBusinessProvisioningInput {
  readonly externalBusinessId: string;
  readonly name: string;
}

export interface ConnectBusinessProvisioningResult {
  readonly outcome: ConnectBusinessProvisioningOutcome;
  readonly business: BusinessIdentity;
  readonly mapping: BusinessExternalMapping;
}

const normalizeExternalBusinessId = (value: string): string => {
  const normalized = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new Error('Invalid Connect external Business identifier');
  }
  return normalized;
};

const findMapping = async (
  client: PoolClient,
  provider: string,
  externalBusinessId: string,
): Promise<BusinessExternalMapping | null> => {
  const result = await client.query(
    `SELECT id, provider, external_business_id, business_id, created_at, updated_at
       FROM ghm.business_external_mapping
      WHERE provider = $1
        AND external_business_id = $2`,
    [provider, externalBusinessId],
  );
  if (result.rowCount !== 1) return null;
  const row = result.rows[0];
  return {
    id: Number(row.id),
    provider: String(row.provider),
    externalBusinessId: String(row.external_business_id),
    businessId: Number(row.business_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const linkMappingInTransaction = async (
  client: PoolClient,
  provider: string,
  externalBusinessId: string,
  businessId: number,
): Promise<BusinessExternalMapping> => {
  const result = await client.query(
    `SELECT * FROM ghm.auth_link_business_external_mapping($1, $2, $3)`,
    [provider, externalBusinessId, businessId],
  );
  if (result.rowCount !== 1) throw new Error('Business external mapping link failed');

  const row = result.rows[0];
  const outcome = String(row.outcome);
  if (outcome === 'conflict') throw new Error('Connect Business mapping conflict');
  if (outcome === 'business_not_found') throw new Error('Canonical Business not found');
  if (outcome !== 'created' && outcome !== 'already_linked') {
    throw new Error(`Unexpected Business mapping outcome: ${outcome}`);
  }

  return {
    id: Number(row.id),
    provider: String(row.provider),
    externalBusinessId: String(row.external_business_id),
    businessId: Number(row.business_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export class ConnectBusinessAdapter {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async provisionOrResolve(
    context: AuthContext,
    input: ConnectBusinessProvisioningInput,
  ): Promise<ConnectBusinessProvisioningResult> {
    requireAuthenticatedContext(context);
    assertRole(context, 'admin', 'business');

    const externalBusinessId = normalizeExternalBusinessId(input.externalBusinessId);
    const name = input.name.trim();
    if (!name) throw new Error('Connect Business name is required');

    return withAuthorizedTransaction(context, async client => {
      // The external Business identity is the concurrency key. This lock is
      // transaction-scoped and independent of the authenticated GHM account.
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`connect-business:${EXTERNAL_IDENTITY_PROVIDER_SUPABASE}:${externalBusinessId}`],
      );

      const existing = await findMapping(
        client,
        EXTERNAL_IDENTITY_PROVIDER_SUPABASE,
        externalBusinessId,
      );

      if (existing) {
        const businessResult = await client.query(
          `SELECT id, name, slug, description, phone, email, insurance_verified,
                  jobs_completed, verification_status, is_active, created_at, updated_at
             FROM ghm.business
            WHERE id = $1`,
          [existing.businessId],
        );
        if (businessResult.rowCount !== 1) {
          throw new Error('Mapped canonical Business not found');
        }

        const row = businessResult.rows[0];
        const business: BusinessIdentity = {
          id: Number(row.id),
          name: row.name,
          slug: row.slug,
          description: row.description ?? null,
          phone: row.phone ?? null,
          email: row.email ?? null,
          insuranceVerified: row.insurance_verified === true,
          jobsCompleted: Number(row.jobs_completed ?? 0),
          verificationStatus: row.verification_status,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        return { outcome: 'resolved', business, mapping: existing };
      }

      const business = await createBusinessInTransaction(
        client,
        context,
        { name } satisfies CreateBusinessInput,
        createBusinessSlug(name),
      );

      const mapping = await linkMappingInTransaction(
        client,
        EXTERNAL_IDENTITY_PROVIDER_SUPABASE,
        externalBusinessId,
        business.id,
      );

      return { outcome: 'provisioned', business, mapping };
    }, this.transactionPool);
  }
}

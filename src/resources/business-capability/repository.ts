import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  BusinessCapability,
  BusinessCapabilityId,
  BusinessCapabilityRepository,
  CreateBusinessCapabilityInput,
} from './contracts';

const COLUMNS = `id, business_id, capability_id, proficiency_level, description,
  assertion_status, assertion_basis, verification_status, effective_from,
  effective_until, source_reference, submitted_at, verified_by, verified_at,
  verification_reason, created_by, created_at, updated_at`;

const mapBusinessCapability = (row: any): BusinessCapability => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  capabilityId: String(row.capability_id),
  proficiencyLevel: row.proficiency_level,
  description: row.description,
  assertionStatus: row.assertion_status,
  assertionBasis: row.assertion_basis,
  verificationStatus: row.verification_status,
  effectiveFrom: row.effective_from,
  effectiveUntil: row.effective_until,
  sourceReference: row.source_reference,
  submittedAt: row.submitted_at,
  verifiedBy: row.verified_by === null ? null : Number(row.verified_by),
  verifiedAt: row.verified_at,
  verificationReason: row.verification_reason,
  createdBy: row.created_by === null ? null : Number(row.created_by),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value as number;
};

const requireUuid = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Capability ID must be a valid UUID');
  }
  return value;
};

const assertBusinessManagementAuthority = async (
  client: PoolClient,
  context: AuthContext,
  businessId: number,
): Promise<void> => {
  const result = await client.query(
    `SELECT 1
       FROM ghm.business b
      WHERE b.id = $1
        AND b.is_active = true
        AND EXISTS (
          SELECT 1
            FROM ghm.business_membership bm
           WHERE bm.business_id = b.id
             AND bm.account_id = $2
             AND bm.membership_status = 'active'
             AND bm.membership_role IN ('owner', 'administrator')
        )`,
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Business management permission required');
};

const assertBusinessReadAuthority = async (
  client: PoolClient,
  context: AuthContext,
  businessId: number,
): Promise<void> => {
  const result = await client.query(
    `SELECT 1
       FROM ghm.business b
      WHERE b.id = $1
        AND b.is_active = true
        AND EXISTS (
          SELECT 1
            FROM ghm.business_membership bm
           WHERE bm.business_id = b.id
             AND bm.account_id = $2
             AND bm.membership_status = 'active'
        )`,
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Business access required');
};

export class PostgresBusinessCapabilityRepository implements BusinessCapabilityRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async createBusinessCapability(
    context: AuthContext,
    input: CreateBusinessCapabilityInput,
  ): Promise<BusinessCapability> {
    const businessId = requirePositiveId(input.businessId, 'businessId');
    const capabilityId = requireUuid(input.capabilityId);

    return withAuthorizedTransaction(context, async client => {
      await assertBusinessManagementAuthority(client, context, businessId);

      const capability = await client.query(
        `SELECT 1
           FROM ghm.capability
          WHERE id = $1
            AND lifecycle_status = 'active'
            AND is_selectable = true`,
        [capabilityId],
      );
      if (capability.rowCount !== 1) throw new Error('Capability not found or not selectable');

      const result = await client.query(
        `INSERT INTO ghm.business_capability
          (
            business_id, capability_id, proficiency_level, description,
            assertion_status, assertion_basis, verification_status,
            effective_from, effective_until, source_reference, submitted_at,
            verified_by, verified_at, verification_reason, created_by
          )
         VALUES (
            $1, $2, $3, NULLIF(btrim($4), ''),
            COALESCE($5, 'active'),
            COALESCE($6, 'self_declared'),
            COALESCE($7, 'unverified'),
            COALESCE($8, now()), $9, NULLIF(btrim($10), ''),
            COALESCE($11, now()), $12, $13, NULLIF(btrim($14), ''), $15
         )
         RETURNING ${COLUMNS}`,
        [
          businessId,
          capabilityId,
          input.proficiencyLevel ?? null,
          input.description ?? null,
          input.assertionStatus ?? null,
          input.assertionBasis ?? null,
          input.verificationStatus ?? null,
          input.effectiveFrom ?? null,
          input.effectiveUntil ?? null,
          input.sourceReference ?? null,
          input.submittedAt ?? null,
          input.verifiedBy ?? null,
          input.verifiedAt ?? null,
          input.verificationReason ?? null,
          context.userId,
        ],
      );
      return mapBusinessCapability(result.rows[0]);
    }, this.transactionPool);
  }

  async getBusinessCapability(
    context: AuthContext,
    businessCapabilityId: BusinessCapabilityId,
  ): Promise<BusinessCapability | null> {
    const id = requirePositiveId(businessCapabilityId, 'businessCapabilityId');
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ${COLUMNS}
           FROM ghm.business_capability
          WHERE id = $1`,
        [id],
      );
      if (result.rowCount !== 1) return null;
      await assertBusinessReadAuthority(client, context, Number(result.rows[0].business_id));
      return mapBusinessCapability(result.rows[0]);
    }, this.transactionPool);
  }

  async listBusinessCapabilities(
    context: AuthContext,
    businessId: number,
  ): Promise<BusinessCapability[]> {
    const id = requirePositiveId(businessId, 'businessId');
    return withAuthorizedTransaction(context, async client => {
      await assertBusinessReadAuthority(client, context, id);
      const result = await client.query(
        `SELECT ${COLUMNS}
           FROM ghm.business_capability
          WHERE business_id = $1
          ORDER BY created_at ASC, id ASC`,
        [id],
      );
      return result.rows.map(mapBusinessCapability);
    }, this.transactionPool);
  }
}

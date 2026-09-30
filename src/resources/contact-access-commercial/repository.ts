import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { ContactAccessEntitlement } from '../contact-access/contracts';
import type {
  AuthorizeContactAccessCommercialInput,
  ContactAccessCommercialFact,
  ContactAccessCommercialGrantResult,
  ContactAccessCommercialRepository,
} from './contracts';

const mapFact = (row: Record<string, unknown>): ContactAccessCommercialFact => ({
  id: Number(row.commercial_fact_id ?? row.id),
  businessId: Number(row.business_id),
  opportunityId: Number(row.opportunity_id),
  idempotencyKey: String(row.idempotency_key),
  verificationStatus: 'verified',
  commercialSource: String(row.commercial_source),
  verifiedByAccountId: row.verified_by_account_id === null || row.verified_by_account_id === undefined
    ? null
    : Number(row.verified_by_account_id),
  verifiedAt: row.verified_at as Date,
  createdAt: row.created_at as Date,
});

const mapEntitlementFromGrantRow = (row: Record<string, unknown>): ContactAccessEntitlement => ({
  id: Number(row.entitlement_id ?? row.id),
  businessId: Number(row.business_id),
  opportunityId: Number(row.opportunity_id),
  authorizationStatus: row.authorization_status as ContactAccessEntitlement['authorizationStatus'],
  grantReason: row.grant_reason as ContactAccessEntitlement['grantReason'],
  grantSource: String(row.grant_source),
  grantedByAccountId: row.granted_by_account_id === null || row.granted_by_account_id === undefined
    ? null
    : Number(row.granted_by_account_id),
  grantedAt: row.granted_at as Date,
  commercialEventReference: row.commercial_event_reference === null || row.commercial_event_reference === undefined
    ? null
    : String(row.commercial_event_reference),
  commercialFactId: row.contact_access_commercial_fact_id === null || row.contact_access_commercial_fact_id === undefined
    ? (row.commercial_fact_id === null || row.commercial_fact_id === undefined
      ? null
      : Number(row.commercial_fact_id))
    : Number(row.contact_access_commercial_fact_id),
  revokedAt: (row.revoked_at as Date | null) ?? null,
  revokedByAccountId: row.revoked_by_account_id === null || row.revoked_by_account_id === undefined
    ? null
    : Number(row.revoked_by_account_id),
  revocationReason: row.revocation_reason === null || row.revocation_reason === undefined
    ? null
    : String(row.revocation_reason),
  createdAt: row.created_at as Date,
  updatedAt: row.updated_at as Date,
});

export class PostgresContactAccessCommercialRepository implements ContactAccessCommercialRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async authorizeContactAccessFromVerifiedCommercial(
    context: AuthContext,
    input: AuthorizeContactAccessCommercialInput,
  ): Promise<ContactAccessCommercialGrantResult> {
    return withAuthorizedTransaction(context, async (client) => {
      await client.query(`SELECT set_config('ghm.actor_account_id', $1, true)`, [String(context.userId)]);

      const result = await client.query(
        `SELECT *
         FROM ghm.grant_contact_access_commercial($1, $2, $3, $4)`,
        [input.businessId, input.opportunityId, input.idempotencyKey, input.commercialSource],
      );

      if (result.rowCount !== 1) {
        throw new Error('Contact Access commercial authorization failed');
      }

      const row = result.rows[0] as Record<string, unknown>;

      const factResult = await client.query(
        `SELECT id, business_id, opportunity_id, idempotency_key, verification_status,
                commercial_source, verified_by_account_id, verified_at, created_at
         FROM ghm.contact_access_commercial_fact
         WHERE id = $1`,
        [Number(row.commercial_fact_id)],
      );

      if (factResult.rowCount !== 1) {
        throw new Error('Contact Access commercial fact not found after authorization');
      }

      return {
        commercialFact: mapFact(factResult.rows[0] as Record<string, unknown>),
        entitlement: mapEntitlementFromGrantRow({
          ...row,
          contact_access_commercial_fact_id: row.commercial_fact_id,
        }),
      };
    }, this.transactionPool);
  }
}

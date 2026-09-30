import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  BusinessId,
  ContactAccessCheckResult,
  ContactAccessEntitlement,
  ContactAccessRepository,
  ContactDisclosure,
  GrantContactAccessInput,
  OpportunityId,
  RevokeContactAccessInput,
} from './contracts';

const ENTITLEMENT_COLUMNS = `
  id,
  business_id,
  opportunity_id,
  authorization_status,
  grant_reason,
  grant_source,
  granted_by_account_id,
  granted_at,
  commercial_event_reference,
  contact_access_commercial_fact_id,
  revoked_at,
  revoked_by_account_id,
  revocation_reason,
  created_at,
  updated_at
`;

const mapEntitlement = (row: Record<string, unknown>): ContactAccessEntitlement => ({
  id: Number(row.id),
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
    ? null
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

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value as number;
};

const assertBusinessReadAccess = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null; rows: unknown[] }> },
  context: AuthContext,
  businessId: BusinessId,
): Promise<void> => {
  const result = await client.query(
    `SELECT 1
     FROM ghm.business_membership
     WHERE business_id = $1
       AND account_id = $2
       AND membership_status = 'active'
     LIMIT 1`,
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) {
    throw new Error('Business read permission required');
  }
};

export class PostgresContactAccessRepository implements ContactAccessRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async grantContactAccess(context: AuthContext, input: GrantContactAccessInput): Promise<ContactAccessEntitlement> {
    const businessId = requirePositiveId(input.businessId, 'businessId');
    const opportunityId = requirePositiveId(input.opportunityId, 'opportunityId');
    return withAuthorizedTransaction(context, async (client) => {
      await client.query(`SELECT set_config('ghm.actor_account_id', $1, true)`, [String(context.userId)]);
      const result = await client.query(
        `SELECT * FROM ghm.grant_contact_access_manual($1, $2, $3)`,
        [businessId, opportunityId, input.grantSource],
      );
      if (result.rowCount !== 1) {
        throw new Error('Contact Access grant failed');
      }
      return mapEntitlement(result.rows[0] as Record<string, unknown>);
    }, this.transactionPool);
  }

  async getContactAccess(
    context: AuthContext,
    businessId: BusinessId,
    opportunityId: OpportunityId,
  ): Promise<ContactAccessCheckResult> {
    const resolvedBusinessId = requirePositiveId(businessId, 'businessId');
    const resolvedOpportunityId = requirePositiveId(opportunityId, 'opportunityId');

    return withAuthorizedTransaction(context, async (client) => {
      await assertBusinessReadAccess(client, context, resolvedBusinessId);

      const active = await client.query(
        `SELECT ${ENTITLEMENT_COLUMNS}
         FROM ghm.contact_access_entitlement
         WHERE business_id = $1
           AND opportunity_id = $2
           AND authorization_status = 'active'
         LIMIT 1`,
        [resolvedBusinessId, resolvedOpportunityId],
      );

      if (active.rowCount === 1) {
        const entitlement = mapEntitlement(active.rows[0] as Record<string, unknown>);
        return {
          businessId: resolvedBusinessId,
          opportunityId: resolvedOpportunityId,
          status: 'active',
          entitlement,
        };
      }

      const revoked = await client.query(
        `SELECT ${ENTITLEMENT_COLUMNS}
         FROM ghm.contact_access_entitlement
         WHERE business_id = $1
           AND opportunity_id = $2
           AND authorization_status = 'revoked'
         ORDER BY revoked_at DESC NULLS LAST, id DESC
         LIMIT 1`,
        [resolvedBusinessId, resolvedOpportunityId],
      );

      if (revoked.rowCount === 1) {
        const entitlement = mapEntitlement(revoked.rows[0] as Record<string, unknown>);
        return {
          businessId: resolvedBusinessId,
          opportunityId: resolvedOpportunityId,
          status: 'revoked',
          entitlement,
        };
      }

      return {
        businessId: resolvedBusinessId,
        opportunityId: resolvedOpportunityId,
        status: 'absent',
        entitlement: null,
      };
    }, this.transactionPool);
  }

  async revokeContactAccess(context: AuthContext, input: RevokeContactAccessInput): Promise<ContactAccessEntitlement> {
    const businessId = requirePositiveId(input.businessId, 'businessId');
    const opportunityId = requirePositiveId(input.opportunityId, 'opportunityId');
    return withAuthorizedTransaction(context, async (client) => {
      await client.query(`SELECT set_config('ghm.actor_account_id', $1, true)`, [String(context.userId)]);
      const result = await client.query(
        `SELECT * FROM ghm.revoke_contact_access($1, $2, $3)`,
        [businessId, opportunityId, input.revocationReason],
      );
      if (result.rowCount !== 1) {
        throw new Error('Contact Access revoke failed');
      }
      return mapEntitlement(result.rows[0] as Record<string, unknown>);
    }, this.transactionPool);
  }

  async discloseContactAccess(
    context: AuthContext,
    businessId: BusinessId,
    opportunityId: OpportunityId,
  ): Promise<ContactDisclosure> {
    const resolvedBusinessId = requirePositiveId(businessId, 'businessId');
    const resolvedOpportunityId = requirePositiveId(opportunityId, 'opportunityId');

    return withAuthorizedTransaction(context, async (client) => {
      await assertBusinessReadAccess(client, context, resolvedBusinessId);

      const active = await client.query(
        `SELECT 1
         FROM ghm.contact_access_entitlement
         WHERE business_id = $1
           AND opportunity_id = $2
           AND authorization_status = 'active'
         LIMIT 1`,
        [resolvedBusinessId, resolvedOpportunityId],
      );
      if (active.rowCount !== 1) {
        throw new Error('Contact Access disclosure denied');
      }

      const contacts = await client.query(
        `SELECT business_id, customer_name, customer_phone, customer_email
         FROM ghm.enquiry
         WHERE opportunity_id = $1
         ORDER BY id ASC`,
        [resolvedOpportunityId],
      );
      if (contacts.rowCount === 0) {
        throw new Error('Opportunity Enquiry association not found');
      }
      if ((contacts.rowCount ?? 0) > 1) {
        throw new Error('Opportunity Enquiry association is ambiguous');
      }

      const row = contacts.rows[0] as Record<string, unknown>;
      if (Number(row.business_id) !== resolvedBusinessId) {
        throw new Error('Opportunity Enquiry association not found');
      }

      return {
        customerName: String(row.customer_name),
        customerPhone: row.customer_phone === null || row.customer_phone === undefined
          ? null
          : String(row.customer_phone),
        customerEmail: row.customer_email === null || row.customer_email === undefined
          ? null
          : String(row.customer_email),
      };
    }, this.transactionPool);
  }
}

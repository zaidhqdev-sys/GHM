import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  CreateOpportunityParticipantInput,
  OpportunityParticipant,
  OpportunityParticipantId,
  OpportunityParticipantRepository,
  ParticipationRole,
  ParticipationStatus,
  UpdateOpportunityParticipantInput,
} from './contracts';

const COLUMNS = `id, opportunity_id, account_id, business_id, participation_role, participation_status, created_by, created_at, updated_at`;
const VISIBILITY_STATUSES: readonly ParticipationStatus[] = ['invited', 'active', 'completed'];
const ROLES: readonly ParticipationRole[] = ['creator', 'owner', 'recipient', 'responder', 'evaluator', 'fulfiller'];
const STATUSES: readonly ParticipationStatus[] = ['invited', 'active', 'declined', 'withdrawn', 'removed', 'completed'];

const mapParticipant = (row: any): OpportunityParticipant => ({
  id: Number(row.id),
  opportunityId: Number(row.opportunity_id),
  accountId: row.account_id === null ? null : Number(row.account_id),
  businessId: row.business_id === null ? null : Number(row.business_id),
  participationRole: row.participation_role,
  participationStatus: row.participation_status,
  createdBy: Number(row.created_by),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const requireRole = (value: unknown): ParticipationRole => {
  if (!ROLES.includes(value as ParticipationRole)) throw new Error('Invalid participation role');
  return value as ParticipationRole;
};

const requireStatus = (value: unknown): ParticipationStatus => {
  if (!STATUSES.includes(value as ParticipationStatus)) throw new Error('Invalid participation status');
  return value as ParticipationStatus;
};

const assertPrincipalXor = (accountId: number | null | undefined, businessId: number | null | undefined): void => {
  if ((accountId == null) === (businessId == null)) throw new Error('Exactly one participant principal is required');
};

const assertOpportunityVisibleToContext = async (client: PoolClient, context: AuthContext, opportunityId: number): Promise<void> => {
  const result = await client.query(
    `SELECT 1
     FROM ghm.opportunity o
     WHERE o.id = $1
       AND (
         o.creator_account_id = $2
         OR (
           o.owner_business_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM ghm.business_membership bm
             WHERE bm.business_id = o.owner_business_id
               AND bm.account_id = $2
               AND bm.membership_status = 'active'
               AND bm.membership_role IN ('owner','administrator')
           )
         )
         OR (
           EXISTS (
             SELECT 1 FROM ghm.opportunity_participant op
             WHERE op.opportunity_id = o.id
               AND op.account_id = $2
               AND op.participation_status = ANY($3::text[])
           )
           OR EXISTS (
             SELECT 1 FROM ghm.opportunity_participant op
             JOIN ghm.business_membership bm ON bm.business_id = op.business_id
             WHERE op.opportunity_id = o.id
               AND bm.account_id = $2
               AND bm.membership_status = 'active'
               AND op.participation_status = ANY($3::text[])
           )
         )
       )`,
    [opportunityId, context.userId, VISIBILITY_STATUSES],
  );
  if (result.rowCount !== 1) throw new Error('Opportunity participant access required');
};

const assertParticipantReadAuthority = async (client: PoolClient, context: AuthContext, participantId: number): Promise<void> => {
  const result = await client.query(
    `SELECT 1
     FROM ghm.opportunity_participant op
     JOIN ghm.opportunity o ON o.id = op.opportunity_id
     WHERE op.id = $1
       AND (
         o.creator_account_id = $2
         OR (
           o.owner_business_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM ghm.business_membership bm
             WHERE bm.business_id = o.owner_business_id
               AND bm.account_id = $2
               AND bm.membership_status = 'active'
               AND bm.membership_role IN ('owner','administrator')
           )
         )
         OR (op.account_id = $2 AND op.participation_status = ANY($3::text[]))
         OR EXISTS (
           SELECT 1 FROM ghm.business_membership bm
           WHERE bm.business_id = op.business_id
             AND bm.account_id = $2
             AND bm.membership_status = 'active'
             AND op.participation_status = ANY($3::text[])
         )
       )`,
    [participantId, context.userId, VISIBILITY_STATUSES],
  );
  if (result.rowCount !== 1) throw new Error('Opportunity participant access required');
};

const assertParticipantManagementAuthority = async (client: PoolClient, context: AuthContext, opportunityId: number): Promise<void> => {
  const result = await client.query(
    `SELECT 1 FROM ghm.opportunity o
     WHERE o.id = $1
       AND (
         o.creator_account_id = $2
         OR (
           o.owner_business_id IS NOT NULL
           AND EXISTS (
             SELECT 1 FROM ghm.business_membership bm
             WHERE bm.business_id = o.owner_business_id
               AND bm.account_id = $2
               AND bm.membership_status = 'active'
               AND bm.membership_role IN ('owner','administrator')
           )
         )
       )`,
    [opportunityId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Opportunity participant management permission required');
};

export class PostgresOpportunityParticipantRepository implements OpportunityParticipantRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async createParticipant(context: AuthContext, input: CreateOpportunityParticipantInput): Promise<OpportunityParticipant> {
    const opportunityId = requirePositiveId(input.opportunityId, 'opportunityId');
    const accountId = input.accountId ?? null;
    const businessId = input.businessId ?? null;
    assertPrincipalXor(accountId, businessId);
    if (accountId !== null) requirePositiveId(accountId, 'accountId');
    if (businessId !== null) requirePositiveId(businessId, 'businessId');
    const role = requireRole(input.participationRole);
    const status = requireStatus(input.participationStatus ?? 'active');

    return withAuthorizedTransaction(context, async client => {
      await assertParticipantManagementAuthority(client, context, opportunityId);
      const opportunity = await client.query(`SELECT 1 FROM ghm.opportunity WHERE id = $1`, [opportunityId]);
      if (opportunity.rowCount !== 1) throw new Error('Opportunity not found');
      if (accountId !== null) {
        const account = await client.query(`SELECT 1 FROM ghm.account_identity WHERE id = $1`, [accountId]);
        if (account.rowCount !== 1) throw new Error('Account not found');
      }
      if (businessId !== null) {
        const business = await client.query(
          `SELECT 1 FROM ghm.business WHERE id = $1 AND is_active = true AND verification_status = 'approved'`,
          [businessId],
        );
        if (business.rowCount !== 1) throw new Error('Business not found or not eligible');
      }
      const result = await client.query(
        `INSERT INTO ghm.opportunity_participant
          (opportunity_id, account_id, business_id, participation_role, participation_status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING ${COLUMNS}`,
        [opportunityId, accountId, businessId, role, status, context.userId],
      );
      return mapParticipant(result.rows[0]);
    }, this.transactionPool);
  }

  async getParticipant(context: AuthContext, participantId: OpportunityParticipantId): Promise<OpportunityParticipant | null> {
    requirePositiveId(participantId, 'participantId');
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(`SELECT ${COLUMNS} FROM ghm.opportunity_participant WHERE id = $1`, [participantId]);
      if (result.rowCount !== 1) return null;
      await assertParticipantReadAuthority(client, context, participantId);
      return mapParticipant(result.rows[0]);
    }, this.transactionPool);
  }

  async listOpportunityParticipants(context: AuthContext, opportunityId: number): Promise<OpportunityParticipant[]> {
    requirePositiveId(opportunityId, 'opportunityId');
    return withAuthorizedTransaction(context, async client => {
      await assertOpportunityVisibleToContext(client, context, opportunityId);
      const result = await client.query(
        `SELECT ${COLUMNS}
         FROM ghm.opportunity_participant
         WHERE opportunity_id = $1
         ORDER BY created_at ASC, id ASC`,
        [opportunityId],
      );
      return result.rows.map(mapParticipant);
    }, this.transactionPool);
  }

  async updateParticipant(context: AuthContext, participantId: OpportunityParticipantId, input: UpdateOpportunityParticipantInput): Promise<OpportunityParticipant> {
    requirePositiveId(participantId, 'participantId');
    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    if (entries.length === 0) throw new Error('Participant update requires at least one field');
    if (Object.hasOwn(input, 'participationRole')) requireRole(input.participationRole);
    if (Object.hasOwn(input, 'participationStatus')) requireStatus(input.participationStatus);
    throw new Error('Participant updates are not supported until a concrete transition authority is qualified');
  }
}

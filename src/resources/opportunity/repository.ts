import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { CreateOpportunityInput, Opportunity, OpportunityLifecycleStatus, OpportunityPublicProjection, OpportunityRepository, OpportunityTypeId, UpdateOpportunityInput } from './contracts';

const COLUMNS = `id, opportunity_type_id, creator_account_id, owner_business_id, country_id, currency_id, title, description, lifecycle_status, visibility, budget_min, budget_max, opens_at, closes_at, created_at, updated_at`;
const TERMINAL_STATUSES = new Set<OpportunityLifecycleStatus>(['completed', 'cancelled', 'archived']);
const ALLOWED_TRANSITIONS: Record<OpportunityLifecycleStatus, readonly OpportunityLifecycleStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['responding', 'cancelled'],
  responding: ['evaluating', 'cancelled'],
  evaluating: ['awarded', 'cancelled'],
  awarded: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};
const mapOpportunity = (row: any): Opportunity => ({
  id: Number(row.id),
  opportunityTypeId: Number(row.opportunity_type_id),
  creatorAccountId: Number(row.creator_account_id),
  ownerBusinessId: row.owner_business_id === null ? null : Number(row.owner_business_id),
  countryId: row.country_id === null ? null : Number(row.country_id),
  currencyId: row.currency_id === null ? null : Number(row.currency_id),
  title: row.title,
  description: row.description,
  lifecycleStatus: row.lifecycle_status,
  visibility: row.visibility,
  budgetMin: row.budget_min === null ? null : Number(row.budget_min),
  budgetMax: row.budget_max === null ? null : Number(row.budget_max),
  opensAt: row.opens_at,
  closesAt: row.closes_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const PUBLIC_COLUMNS = `id, opportunity_type_id, country_id, currency_id, title, description, lifecycle_status, visibility, budget_min, budget_max, opens_at, closes_at, created_at`;

const mapPublicOpportunity = (row: any): OpportunityPublicProjection => ({
  id: Number(row.id),
  opportunityTypeId: Number(row.opportunity_type_id),
  countryId: row.country_id === null ? null : Number(row.country_id),
  currencyId: row.currency_id === null ? null : Number(row.currency_id),
  title: row.title,
  description: row.description,
  lifecycleStatus: row.lifecycle_status,
  visibility: row.visibility,
  budgetMin: row.budget_min === null ? null : Number(row.budget_min),
  budgetMax: row.budget_max === null ? null : Number(row.budget_max),
  opensAt: row.opens_at,
  closesAt: row.closes_at,
  createdAt: row.created_at,
});
const requireText = (value: unknown, field: string, min: number, max: number): string => { if (typeof value !== 'string') throw new Error(`${field} is required`); const normalized = value.trim(); if (normalized.length < min || normalized.length > max) throw new Error(`${field} must be between ${min} and ${max} characters`); return normalized; };
const requirePositiveId = (value: unknown, field: string): number => { if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`); return value as number; };
const validateBudget = (min: number | null | undefined, max: number | null | undefined) => { for (const [value, field] of [[min, 'budgetMin'], [max, 'budgetMax']] as const) if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error(`${field} must be null or a non-negative number`); if (min != null && max != null && max < min) throw new Error('budgetMax must be greater than or equal to budgetMin'); };
const validateVisibility = (value: unknown): void => { if (!['private', 'participants', 'authenticated', 'public'].includes(String(value))) throw new Error('Invalid Opportunity visibility'); };
const validateDates = (opensAt: Date | null | undefined, closesAt: Date | null | undefined): void => { if (opensAt !== undefined && opensAt !== null && Number.isNaN(opensAt.getTime())) throw new Error('opensAt must be a valid date'); if (closesAt !== undefined && closesAt !== null && Number.isNaN(closesAt.getTime())) throw new Error('closesAt must be a valid date'); if (opensAt != null && closesAt != null && closesAt < opensAt) throw new Error('closesAt must be greater than or equal to opensAt'); };
const normalizeCreate = (input: CreateOpportunityInput) => { const opportunityTypeId = requirePositiveId(input.opportunityTypeId, 'opportunityTypeId') as OpportunityTypeId; const title = requireText(input.title, 'title', 1, 200); const description = requireText(input.description, 'description', 1, 10000); const visibility = input.visibility ?? 'private'; validateVisibility(visibility); validateBudget(input.budgetMin, input.budgetMax); validateDates(input.opensAt, input.closesAt); if (visibility === 'public') throw new Error('Public Opportunities require an explicit lifecycle transition'); return { ...input, opportunityTypeId, title, description, visibility, budgetMin: input.budgetMin ?? null, budgetMax: input.budgetMax ?? null, opensAt: input.opensAt ?? null, closesAt: input.closesAt ?? null }; };
function findById(
  client: PoolClient,
  id: number,
  context: AuthContext,
  ownedOnly: true
): Promise<Opportunity | null>;
function findById(
  client: PoolClient,
  id: number,
  context: AuthContext,
  ownedOnly: false
): Promise<Opportunity | OpportunityPublicProjection | null>;
async function findById(
  client: PoolClient,
  id: number,
  context: AuthContext,
  ownedOnly: boolean
): Promise<Opportunity | OpportunityPublicProjection | null> {
  const ownerWhere = ownedOnly
    ? 'id = $1 AND creator_account_id = $2'
    : `id = $1 AND (
        creator_account_id = $2
        OR (
          owner_business_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM ghm.business_membership bm
            WHERE bm.business_id = ghm.opportunity.owner_business_id
              AND bm.account_id = $2
              AND bm.membership_status = 'active'
              AND bm.membership_role IN ('owner','administrator')
          )
        )
      )`;

  const ownerResult = await client.query(
    `SELECT ${COLUMNS} FROM ghm.opportunity WHERE ${ownerWhere}`,
    [id, context.userId]
  );

  if (ownerResult.rowCount === 1) {
    return mapOpportunity(ownerResult.rows[0]);
  }

  if (ownedOnly) {
    return null;
  }

  const publicResult = await client.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM ghm.opportunity
     WHERE id = $1
       AND visibility IN ('authenticated','public')`,
    [id]
  );

  return publicResult.rowCount === 1
    ? mapPublicOpportunity(publicResult.rows[0])
    : null;
}
const validateCombinedRange = (current: Opportunity, input: UpdateOpportunityInput): void => { const nextMin = Object.hasOwn(input, 'budgetMin') ? input.budgetMin ?? null : current.budgetMin; const nextMax = Object.hasOwn(input, 'budgetMax') ? input.budgetMax ?? null : current.budgetMax; validateBudget(nextMin, nextMax); const nextOpen = Object.hasOwn(input, 'opensAt') ? input.opensAt ?? null : current.opensAt; const nextClose = Object.hasOwn(input, 'closesAt') ? input.closesAt ?? null : current.closesAt; validateDates(nextOpen, nextClose); };

export class PostgresOpportunityRepository implements OpportunityRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}
  async createOpportunity(context: AuthContext, input: CreateOpportunityInput): Promise<Opportunity> { const normalized = normalizeCreate(input); return withAuthorizedTransaction(context, async client => { const type = await client.query(`SELECT 1 FROM ghm.opportunity_type WHERE id = $1 AND is_active = true`, [normalized.opportunityTypeId]); if (type.rowCount !== 1) throw new Error('Opportunity type not found or inactive'); if (normalized.ownerBusinessId != null) { const membership = await client.query(`SELECT 1 FROM ghm.business_membership WHERE business_id = $1 AND account_id = $2 AND membership_status = 'active' AND membership_role IN ('owner','administrator') LIMIT 1`, [normalized.ownerBusinessId, context.userId]); if (membership.rowCount !== 1) throw new Error('Business management permission required'); } const result = await client.query(`INSERT INTO ghm.opportunity (opportunity_type_id, creator_account_id, owner_business_id, country_id, currency_id, title, description, lifecycle_status, visibility, budget_min, budget_max, opens_at, closes_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12) RETURNING ${COLUMNS}`, [normalized.opportunityTypeId, context.userId, normalized.ownerBusinessId ?? null, normalized.countryId ?? null, normalized.currencyId ?? null, normalized.title, normalized.description, normalized.visibility, normalized.budgetMin, normalized.budgetMax, normalized.opensAt, normalized.closesAt]); if (result.rowCount !== 1) throw new Error('Opportunity creation failed'); const opportunity = mapOpportunity(result.rows[0]); await client.query(`INSERT INTO ghm.opportunity_participant (opportunity_id, account_id, business_id, participation_role, participation_status, created_by) VALUES ($1,$2,NULL,'creator','active',$2)`, [opportunity.id, context.userId]); if (opportunity.ownerBusinessId !== null) { await client.query(`INSERT INTO ghm.opportunity_participant (opportunity_id, account_id, business_id, participation_role, participation_status, created_by) VALUES ($1,NULL,$2,'owner','active',$3)`, [opportunity.id, opportunity.ownerBusinessId, context.userId]); } return opportunity; }, this.transactionPool); }
  async getOpportunity(context: AuthContext, opportunityId: number): Promise<Opportunity | OpportunityPublicProjection | null> { requirePositiveId(opportunityId, 'opportunityId'); return withAuthorizedTransaction(context, client => findById(client, opportunityId, context, false), this.transactionPool); }
  async getOwnedOpportunity(context: AuthContext, opportunityId: number): Promise<Opportunity | null> { requirePositiveId(opportunityId, 'opportunityId'); return withAuthorizedTransaction(context, client => findById(client, opportunityId, context, true), this.transactionPool); }
  async updateOwnedOpportunity(context: AuthContext, opportunityId: number, input: UpdateOpportunityInput): Promise<Opportunity> { requirePositiveId(opportunityId, 'opportunityId'); const entries = Object.entries(input).filter(([, value]) => value !== undefined); if (entries.length === 0) throw new Error('Opportunity update requires at least one field'); const allowed = new Set(['opportunityTypeId','ownerBusinessId','countryId','currencyId','title','description','visibility','budgetMin','budgetMax','opensAt','closesAt']); const unsupported = entries.find(([key]) => !allowed.has(key)); if (unsupported) throw new Error(`Unsupported Opportunity update field: ${unsupported[0]}`); if (Object.hasOwn(input, 'opportunityTypeId')) requirePositiveId(input.opportunityTypeId, 'opportunityTypeId'); if (Object.hasOwn(input, 'title')) requireText(input.title, 'title', 1, 200); if (Object.hasOwn(input, 'description')) requireText(input.description, 'description', 1, 10000); if (Object.hasOwn(input, 'visibility')) validateVisibility(input.visibility); return withAuthorizedTransaction(context, async client => { const current = await findById(client, opportunityId, context, true); if (!current) throw new Error('Opportunity not found or ownership required'); if (TERMINAL_STATUSES.has(current.lifecycleStatus)) throw new Error('Terminal Opportunities cannot be updated'); validateCombinedRange(current, input); if (Object.hasOwn(input, 'ownerBusinessId') && input.ownerBusinessId != null) { const membership = await client.query(`SELECT 1 FROM ghm.business_membership WHERE business_id = $1 AND account_id = $2 AND membership_status = 'active' AND membership_role IN ('owner','administrator') LIMIT 1`, [input.ownerBusinessId, context.userId]); if (membership.rowCount !== 1) throw new Error('Business management permission required'); } if (Object.hasOwn(input, 'opportunityTypeId')) { const type = await client.query(`SELECT 1 FROM ghm.opportunity_type WHERE id = $1 AND is_active = true`, [input.opportunityTypeId]); if (type.rowCount !== 1) throw new Error('Opportunity type not found or inactive'); } const nextVisibility = input.visibility ?? current.visibility; if (nextVisibility === 'public' && current.lifecycleStatus === 'draft') throw new Error('Public Opportunities require an explicit lifecycle transition'); const fields: string[] = []; const values: unknown[] = [opportunityId, context.userId]; let parameter = 3; const map: Record<string,string> = { opportunityTypeId:'opportunity_type_id', ownerBusinessId:'owner_business_id', countryId:'country_id', currencyId:'currency_id', title:'title', description:'description', visibility:'visibility', budgetMin:'budget_min', budgetMax:'budget_max', opensAt:'opens_at', closesAt:'closes_at' }; for (const [key,column] of Object.entries(map)) if (Object.hasOwn(input,key) && (input as any)[key] !== undefined) { fields.push(`${column} = $${parameter++}`); values.push((input as any)[key]); } fields.push('updated_at = now()'); const result = await client.query(`UPDATE ghm.opportunity SET ${fields.join(', ')} WHERE id = $1 AND creator_account_id = $2 RETURNING ${COLUMNS}`, values); if (result.rowCount !== 1) throw new Error('Opportunity update failed'); return mapOpportunity(result.rows[0]); }, this.transactionPool); }
  async transitionOpportunity(context: AuthContext, opportunityId: number, nextStatus: OpportunityLifecycleStatus): Promise<Opportunity> { requirePositiveId(opportunityId, 'opportunityId'); if (!Object.hasOwn(ALLOWED_TRANSITIONS, nextStatus)) throw new Error('Invalid Opportunity lifecycle status'); return withAuthorizedTransaction(context, async client => { const current = await findById(client, opportunityId, context, true); if (!current) throw new Error('Opportunity not found or ownership required'); if (!ALLOWED_TRANSITIONS[current.lifecycleStatus].includes(nextStatus)) throw new Error(`Invalid Opportunity lifecycle transition: ${current.lifecycleStatus} -> ${nextStatus}`); if (nextStatus === 'open' && current.visibility === 'public') throw new Error('Public Opportunities cannot be opened from draft'); const result = await client.query(`UPDATE ghm.opportunity SET lifecycle_status = $3, updated_at = now() WHERE id = $1 AND creator_account_id = $2 AND lifecycle_status = $4 RETURNING ${COLUMNS}`, [opportunityId, context.userId, nextStatus, current.lifecycleStatus]); if (result.rowCount !== 1) throw new Error('Opportunity lifecycle transition failed'); return mapOpportunity(result.rows[0]); }, this.transactionPool); }
}

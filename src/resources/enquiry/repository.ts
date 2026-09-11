import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { CreateEnquiryInput, Enquiry, EnquiryId, EnquiryRepository, UpdateEnquiryStatusInput } from './contracts';

const ENQUIRY_COLUMNS = `id, business_id, customer_id, customer_name, customer_phone, customer_email, project, description, city, budget_min, budget_max, urgency, source, status, created_at, updated_at`;

const mapEnquiry = (row: any): Enquiry => ({
  id: Number(row.id), businessId: Number(row.business_id), customerId: Number(row.customer_id), customerName: row.customer_name,
  customerPhone: row.customer_phone, customerEmail: row.customer_email, project: row.project, description: row.description,
  city: row.city, budgetMin: row.budget_min === null ? null : Number(row.budget_min), budgetMax: row.budget_max === null ? null : Number(row.budget_max),
  urgency: row.urgency, source: row.source, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
});

const assertPositiveId = (id: number, field: string): void => {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid ${field}`);
};

const assertActiveOwner = async (client: PoolClient, context: AuthContext, businessId: number): Promise<void> => {
  const result = await client.query(
    `SELECT 1 FROM ghm.business_membership
     WHERE business_id = $1 AND account_id = $2
       AND membership_role = 'owner' AND membership_status = 'active'
     LIMIT 1`,
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Business owner permission required');
};

const assertEligibleMarketplaceTarget = async (client: PoolClient, context: AuthContext, businessId: number): Promise<void> => {
  const result = await client.query(
    `SELECT 1 FROM ghm.business b
     WHERE b.id = $1 AND b.verification_status = 'approved' AND b.is_active = true
       AND b.id NOT IN (
         SELECT bm.business_id FROM ghm.business_membership bm
         WHERE bm.account_id = $2 AND bm.membership_role = 'owner' AND bm.membership_status = 'active'
       )`,
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Enquiry target Business is not eligible');
};

const findById = async (client: PoolClient, enquiryId: EnquiryId, predicate: string, params: unknown[]): Promise<Enquiry | null> => {
  const result = await client.query(`SELECT ${ENQUIRY_COLUMNS} FROM ghm.enquiry WHERE id = $1 AND ${predicate}`, [enquiryId, ...params]);
  return result.rowCount === 1 ? mapEnquiry(result.rows[0]) : null;
};

export class PostgresEnquiryRepository implements EnquiryRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async createEnquiry(context: AuthContext, input: CreateEnquiryInput): Promise<Enquiry> {
    return withAuthorizedTransaction(context, async client => {
      await assertEligibleMarketplaceTarget(client, context, input.businessId);
      const result = await client.query(
        `INSERT INTO ghm.enquiry
          (business_id, customer_id, customer_name, customer_phone, customer_email, project, description, city, budget_min, budget_max, urgency, source, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'marketplace','new')
         RETURNING ${ENQUIRY_COLUMNS}`,
        [input.businessId, context.userId, input.customerName, input.customerPhone ?? null, input.customerEmail ?? null, input.project, input.description, input.city ?? null, input.budgetMin ?? null, input.budgetMax ?? null, input.urgency ?? 'standard'],
      );
      return mapEnquiry(result.rows[0]);
    }, this.transactionPool);
  }

  async getOwnEnquiry(context: AuthContext, enquiryId: EnquiryId): Promise<Enquiry | null> {
    assertPositiveId(enquiryId, 'enquiryId');
    return withAuthorizedTransaction(context, client => findById(client, enquiryId, 'customer_id = $2', [context.userId]), this.transactionPool);
  }

  async getReceivedEnquiry(context: AuthContext, enquiryId: EnquiryId): Promise<Enquiry | null> {
    assertPositiveId(enquiryId, 'enquiryId');
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ${ENQUIRY_COLUMNS} FROM ghm.enquiry e
         WHERE e.id = $1 AND EXISTS (
           SELECT 1 FROM ghm.business_membership bm
           WHERE bm.business_id = e.business_id AND bm.account_id = $2
             AND bm.membership_role = 'owner' AND bm.membership_status = 'active'
         )`,
        [enquiryId, context.userId],
      );
      return result.rowCount === 1 ? mapEnquiry(result.rows[0]) : null;
    }, this.transactionPool);
  }

  async updateReceivedEnquiryStatus(context: AuthContext, enquiryId: EnquiryId, input: UpdateEnquiryStatusInput): Promise<Enquiry> {
    assertPositiveId(enquiryId, 'enquiryId');
    return withAuthorizedTransaction(context, async client => {
      const existing = await this.getReceivedEnquiryInTransaction(client, context, enquiryId);
      if (!existing) throw new Error('Enquiry not found or business owner permission required');
      const result = await client.query(
        `UPDATE ghm.enquiry SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${ENQUIRY_COLUMNS}`,
        [enquiryId, input.status],
      );
      return mapEnquiry(result.rows[0]);
    }, this.transactionPool);
  }

  private async getReceivedEnquiryInTransaction(client: PoolClient, context: AuthContext, enquiryId: EnquiryId): Promise<Enquiry | null> {
    const result = await client.query(
      `SELECT ${ENQUIRY_COLUMNS} FROM ghm.enquiry e
       WHERE e.id = $1 AND EXISTS (
         SELECT 1 FROM ghm.business_membership bm
         WHERE bm.business_id = e.business_id AND bm.account_id = $2
           AND bm.membership_role = 'owner' AND bm.membership_status = 'active'
       )`,
      [enquiryId, context.userId],
    );
    return result.rowCount === 1 ? mapEnquiry(result.rows[0]) : null;
  }
}

import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction, withTenantTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { DirectoryReviewBusiness, DirectoryReviewDecision, DirectoryReviewPresentation, DirectoryReviewRepository, DirectoryReviewStatus } from './contracts';

const mapPresentation = (row: any): DirectoryReviewPresentation => ({
  business_id: Number(row.business_id),
  verification_status: row.verification_status,
  is_verified: row.is_verified === true,
  directory_review_submitted_at: row.directory_review_submitted_at ?? null,
  directory_review_last_reason: row.directory_review_last_reason ?? null,
  directory_review_last_event_type: row.directory_review_last_event_type ?? null,
});
const mapBusiness = (row: any): DirectoryReviewBusiness => ({
  id: Number(row.id), name: row.name, slug: row.slug, description: row.description ?? null,
  phone: row.phone ?? null, email: row.email ?? null, verification_status: row.verification_status,
  is_verified: row.is_verified === true, is_active: row.is_active === true,
  directory_review_submitted_at: row.directory_review_submitted_at ?? null,
  directory_review_last_reason: row.directory_review_last_reason ?? null,
  directory_review_last_event_type: row.directory_review_last_event_type ?? null,
  owner_account_id: row.owner_account_id === null ? null : Number(row.owner_account_id),
  owner_full_name: row.owner_full_name ?? null, registration_status: row.registration_status ?? null,
  registration_number: row.registration_number ?? null, legal_name: row.legal_name ?? null, created_at: row.created_at,
});

export class PostgresDirectoryReviewRepository implements DirectoryReviewRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async isFounderReviewer(context: AuthContext): Promise<boolean> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query('SELECT ghm.is_directory_listing_founder_reviewer($1) AS allowed', [context.userId]);
      return result.rows[0]?.allowed === true;
    }, this.transactionPool);
  }

  async submit(context: AuthContext, businessId: number): Promise<DirectoryReviewPresentation> {
    return withTenantTransaction(context, businessId, async client => {
      const result = await client.query(
        'SELECT * FROM ghm.submit_business_directory_review($1,$2)',
        [context.userId, businessId],
      );
      if (result.rowCount !== 1) throw new Error('Directory review submission returned no result');
      return mapPresentation(result.rows[0]);
    }, this.transactionPool);
  }

  async list(context: AuthContext, options: { status: DirectoryReviewStatus | null; limit: number; offset: number }): Promise<DirectoryReviewBusiness[]> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        'SELECT * FROM ghm.list_businesses_for_directory_review($1,$2,$3,$4)',
        [context.userId, options.status, options.limit, options.offset],
      );
      return result.rows.map(mapBusiness);
    }, this.transactionPool);
  }

  async review(context: AuthContext, businessId: number, decision: DirectoryReviewDecision, reason: string | null): Promise<DirectoryReviewPresentation> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        'SELECT * FROM ghm.review_business_directory_listing($1,$2,$3,$4)',
        [context.userId, businessId, decision, reason],
      );
      if (result.rowCount !== 1) throw new Error('Directory review decision returned no result');
      return mapPresentation(result.rows[0]);
    }, this.transactionPool);
  }

  async getPresentation(context: AuthContext, businessId: number): Promise<DirectoryReviewPresentation> {
    return withTenantTransaction(context, businessId, async client => {
      const result = await client.query(
        'SELECT * FROM ghm.get_business_directory_review_presentation($1,$2)',
        [context.userId, businessId],
      );
      if (result.rowCount !== 1) throw new Error('Directory review presentation not found');
      return mapPresentation(result.rows[0]);
    }, this.transactionPool);
  }
}

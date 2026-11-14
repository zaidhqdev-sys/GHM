import type { AuthContext } from '../../auth/authorization';
import { withTenantTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { DirectoryReviewPresentation, DirectoryReviewRepository } from './contracts';

const mapPresentation = (row: any): DirectoryReviewPresentation => ({
  business_id: Number(row.business_id),
  verification_status: row.verification_status,
  is_verified: row.is_verified === true,
  directory_review_submitted_at: row.directory_review_submitted_at ?? null,
  directory_review_last_reason: row.directory_review_last_reason ?? null,
  directory_review_last_event_type: row.directory_review_last_event_type ?? null,
});

export class PostgresDirectoryReviewRepository implements DirectoryReviewRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

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

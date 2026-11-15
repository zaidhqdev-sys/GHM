import type { AuthContext } from '../../auth/authorization';
import { withTenantTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { CampaignDirectoryReviewGatewayClient } from '../../http/campaign-directory-review-gateway-client';
import { CampaignDirectoryReviewGatewayError } from '../../http/campaign-directory-review-gateway-client';
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
  constructor(
    private readonly transactionPool?: TransactionPool,
    private readonly gatewayClient?: CampaignDirectoryReviewGatewayClient,
    private readonly gatewayRequired = false,
  ) {}

  async getPresentation(context: AuthContext, businessId: number): Promise<DirectoryReviewPresentation> {
    if (this.gatewayClient) {
      if (!context.actorGatewayBearerToken) throw new Error('Authenticated Actor Gateway bearer token required');
      try { return await this.gatewayClient.getDirectoryReviewPresentation(context.actorGatewayBearerToken, businessId); }
      catch (error) {
        if (error instanceof CampaignDirectoryReviewGatewayError && error.status === 404) throw new Error('Directory review presentation not found');
        throw error;
      }
    }
    if (this.gatewayRequired) throw new Error('Directory review Actor Gateway is required but unavailable');
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

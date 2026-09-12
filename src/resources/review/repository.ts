import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import { pool } from '../../db/pool';
import type {
  CreateReviewInput,
  ModerateReviewInput,
  Review,
  ReviewId,
  ReviewRepository,
} from './contracts';

const REVIEW_COLUMNS = `
  id,
  business_id,
  reviewer_id,
  reviewer_name,
  rating,
  title,
  body,
  moderation_status,
  moderation_reason,
  moderated_by,
  moderated_at,
  created_at,
  updated_at
`;

const assertPositiveId = (id: number, field: string): void => {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`Invalid ${field}`);
  }
};

const mapReview = (row: any): Review => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  reviewerId: Number(row.reviewer_id),
  reviewerName: row.reviewer_name,
  rating: Number(row.rating),
  title: row.title,
  body: row.body,
  moderationStatus: row.moderation_status,
  moderationReason: row.moderation_reason,
  moderatedBy:
    row.moderated_by === null ? null : Number(row.moderated_by),
  moderatedAt: row.moderated_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const assertEligibleReviewTarget = async (
  client: PoolClient,
  context: AuthContext,
  businessId: number,
): Promise<void> => {
  const result = await client.query(
    `SELECT 1
     FROM ghm.business b
     WHERE b.id = $1
       AND b.is_active = true
       AND b.is_verified = true
       AND b.verification_status = 'approved'
       AND NOT EXISTS (
         SELECT 1
         FROM ghm.business_membership bm
         WHERE bm.business_id = b.id
           AND bm.account_id = $2
           AND bm.membership_role = 'owner'
           AND bm.membership_status = 'active'
       )
     LIMIT 1`,
    [businessId, context.userId],
  );

  if (result.rowCount !== 1) {
    throw new Error('Review target Business is not eligible');
  }
};

const findOwnReview = async (
  client: PoolClient,
  context: AuthContext,
  reviewId: ReviewId,
): Promise<Review | null> => {
  const result = await client.query(
    `SELECT ${REVIEW_COLUMNS}
     FROM ghm.review
     WHERE id = $1
       AND reviewer_id = $2`,
    [reviewId, context.userId],
  );

  return result.rowCount === 1
    ? mapReview(result.rows[0])
    : null;
};

const refreshBusinessReviewAggregate = async (
  client: PoolClient,
  businessId: number,
): Promise<void> => {
  await client.query(
    `UPDATE ghm.business b
     SET
       rating = COALESCE(
         (
           SELECT ROUND(AVG(r.rating)::numeric, 2)
           FROM ghm.review r
           WHERE r.business_id = b.id
             AND r.moderation_status = 'approved'
         ),
         0
       ),
       review_count = (
         SELECT COUNT(*)
         FROM ghm.review r
         WHERE r.business_id = b.id
           AND r.moderation_status = 'approved'
       ),
       updated_at = now()
     WHERE b.id = $1`,
    [businessId],
  );
};

export class PostgresReviewRepository implements ReviewRepository {
  constructor(private readonly transactionPool: TransactionPool = pool) {}

  async createReview(
    context: AuthContext,
    input: CreateReviewInput,
  ): Promise<Review> {
    assertPositiveId(input.businessId, 'businessId');

    return withAuthorizedTransaction(
      context,
      async client => {
        await assertEligibleReviewTarget(
          client,
          context,
          input.businessId,
        );

        const accountResult = await client.query(
          `SELECT full_name
           FROM ghm.account_identity
           WHERE id = $1`,
          [context.userId],
        );

        if (accountResult.rowCount !== 1) {
          throw new Error('Authenticated account not found');
        }

        const reviewerName =
          typeof accountResult.rows[0].full_name === 'string' &&
          accountResult.rows[0].full_name.trim().length > 0
            ? accountResult.rows[0].full_name.trim()
            : 'Customer';

        const result = await client.query(
          `INSERT INTO ghm.review (
             business_id,
             reviewer_id,
             reviewer_name,
             rating,
             title,
             body,
             moderation_status,
             moderation_reason,
             moderated_by,
             moderated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', NULL, NULL, NULL)
           RETURNING ${REVIEW_COLUMNS}`,
          [
            input.businessId,
            context.userId,
            reviewerName,
            input.rating,
            input.title,
            input.body,
          ],
        );

        if (result.rowCount !== 1) {
          throw new Error('Review creation failed');
        }

        return mapReview(result.rows[0]);
      },
      this.transactionPool,
    );
  }

  async getOwnReview(
    context: AuthContext,
    reviewId: ReviewId,
  ): Promise<Review | null> {
    assertPositiveId(reviewId, 'reviewId');

    return withAuthorizedTransaction(
      context,
      client => findOwnReview(client, context, reviewId),
      this.transactionPool,
    );
  }

  async getPublicReviews(
    businessId: number,
    limit = 20,
  ): Promise<readonly Review[]> {
    assertPositiveId(businessId, 'businessId');

    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

    const client = await this.transactionPool.connect();

    try {
      const result = await client.query(
        `SELECT ${REVIEW_COLUMNS}
         FROM ghm.review r
         WHERE r.business_id = $1
           AND r.moderation_status = 'approved'
           AND EXISTS (
             SELECT 1
             FROM ghm.business b
             WHERE b.id = r.business_id
               AND b.is_active = true
               AND b.is_verified = true
               AND b.verification_status = 'approved'
           )
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT $2`,
        [businessId, safeLimit],
      );

      return result.rows.map(mapReview);
    } finally {
      client.release();
    }
  }

  async getPendingReviews(
    context: AuthContext,
    limit = 50,
  ): Promise<readonly Review[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

    return withAuthorizedTransaction(
      context,
      async client => {
        const result = await client.query(
          `SELECT ${REVIEW_COLUMNS}
           FROM ghm.review
           WHERE moderation_status = 'pending'
           ORDER BY created_at ASC, id ASC
           LIMIT $1`,
          [safeLimit],
        );

        return result.rows.map(mapReview);
      },
      this.transactionPool,
    );
  }

  async moderateReview(
    context: AuthContext,
    reviewId: ReviewId,
    input: ModerateReviewInput,
  ): Promise<Review> {
    assertPositiveId(reviewId, 'reviewId');

    return withAuthorizedTransaction(
      context,
      async client => {
        const existingResult = await client.query(
          `SELECT ${REVIEW_COLUMNS}
           FROM ghm.review
           WHERE id = $1
             AND moderation_status = 'pending'
           FOR UPDATE`,
          [reviewId],
        );

        if (existingResult.rowCount !== 1) {
          throw new Error('Pending Review was not found');
        }

        const existing = mapReview(existingResult.rows[0]);

        const result = await client.query(
          `UPDATE ghm.review
           SET
             moderation_status = $2,
             moderation_reason = $3,
             moderated_by = $4,
             moderated_at = now(),
             updated_at = now()
           WHERE id = $1
             AND moderation_status = 'pending'
           RETURNING ${REVIEW_COLUMNS}`,
          [
            reviewId,
            input.decision,
            input.decision === 'rejected'
              ? input.rejectionReason
              : null,
            context.userId,
          ],
        );

        if (result.rowCount !== 1) {
          throw new Error('Review moderation failed');
        }

        const review = mapReview(result.rows[0]);

        if (
          existing.moderationStatus === 'approved' ||
          review.moderationStatus === 'approved'
        ) {
          await refreshBusinessReviewAggregate(
            client,
            review.businessId,
          );
        }

        return review;
      },
      this.transactionPool,
    );
  }
}

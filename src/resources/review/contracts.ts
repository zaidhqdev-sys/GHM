import type { AuthContext } from '../../auth/authorization';

export type ReviewId = number;
export type BusinessId = number;
export type AccountId = number;

export type ReviewModerationStatus = 'pending' | 'approved' | 'rejected';

export interface Review {
  readonly id: ReviewId;
  readonly businessId: BusinessId;
  readonly reviewerId: AccountId;
  readonly reviewerName: string;
  readonly rating: number;
  readonly title: string;
  readonly body: string;
  readonly moderationStatus: ReviewModerationStatus;
  readonly moderationReason: string | null;
  readonly moderatedBy: AccountId | null;
  readonly moderatedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateReviewInput {
  readonly businessId: BusinessId;
  readonly rating: number;
  readonly title: string;
  readonly body: string;
}

export type ReviewModerationDecision = 'approved' | 'rejected';

export interface ModerateReviewInput {
  readonly decision: ReviewModerationDecision;
  readonly rejectionReason?: string | null;
}

export interface ReviewRepository {
  createReview(
    context: AuthContext,
    input: CreateReviewInput,
  ): Promise<Review>;

  getOwnReview(
    context: AuthContext,
    reviewId: ReviewId,
  ): Promise<Review | null>;

  getPublicReviews(
    businessId: BusinessId,
    limit?: number,
  ): Promise<readonly Review[]>;

  getPendingReviews(
    context: AuthContext,
    limit?: number,
  ): Promise<readonly Review[]>;

  moderateReview(
    context: AuthContext,
    reviewId: ReviewId,
    input: ModerateReviewInput,
  ): Promise<Review>;
}

export interface ReviewService {
  createReview(
    context: AuthContext,
    input: CreateReviewInput,
  ): Promise<Review>;

  getOwnReview(
    context: AuthContext,
    reviewId: ReviewId,
  ): Promise<Review | null>;

  getPublicReviews(
    businessId: BusinessId,
    limit?: number,
  ): Promise<readonly Review[]>;

  getPendingReviews(
    context: AuthContext,
    limit?: number,
  ): Promise<readonly Review[]>;

  moderateReview(
    context: AuthContext,
    reviewId: ReviewId,
    input: ModerateReviewInput,
  ): Promise<Review>;
}

export const REVIEW_OPERATIONS = Object.freeze({
  create: 'review.create',
  readOwn: 'review.readOwn',
  readPublic: 'review.readPublic',
  readPending: 'review.readPending',
  approve: 'review.approve',
  reject: 'review.reject',
});

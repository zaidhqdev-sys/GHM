import type { AuthContext } from '../../auth/authorization';
import { assertRole } from '../../auth/authorization';
import type {
  CreateReviewInput,
  ModerateReviewInput,
  Review,
  ReviewRepository,
  ReviewService,
} from './contracts';

const validatePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`Invalid ${field}`);
  }

  return value as number;
};

const validateRating = (value: unknown): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > 5
  ) {
    throw new Error('rating must be an integer between 1 and 5');
  }

  return value as number;
};

const validateText = (
  value: unknown,
  field: string,
  min: number,
  max: number,
): string => {
  if (typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }

  const normalized = value.trim();

  if (normalized.length < min || normalized.length > max) {
    throw new Error(
      `${field} must be between ${min} and ${max} characters`,
    );
  }

  return normalized;
};

const validateCreateInput = (
  input: CreateReviewInput,
): CreateReviewInput => ({
  businessId: validatePositiveId(input.businessId, 'businessId'),
  rating: validateRating(input.rating),
  title: validateText(input.title, 'title', 3, 120),
  body: validateText(input.body, 'body', 10, 2000),
});

const validateModerationInput = (
  input: ModerateReviewInput,
): ModerateReviewInput => {
  if (
    input.decision !== 'approved' &&
    input.decision !== 'rejected'
  ) {
    throw new Error('Invalid Review moderation decision');
  }

  if (input.decision === 'rejected') {
    const reason = validateText(
      input.rejectionReason,
      'rejectionReason',
      1,
      2000,
    );

    return {
      decision: 'rejected',
      rejectionReason: reason,
    };
  }

  return {
    decision: 'approved',
    rejectionReason: null,
  };
};

const validateLimit = (
  value: unknown,
  fallback: number,
): number => {
  if (value === undefined) return fallback;

  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1
  ) {
    throw new Error('Invalid Review limit');
  }

  return Math.min(value as number, 100);
};

export class ReviewServiceImpl implements ReviewService {
  constructor(private readonly repository: ReviewRepository) {}

  async createReview(
    context: AuthContext,
    input: CreateReviewInput,
  ): Promise<Review> {
    assertRole(context, 'customer');

    return this.repository.createReview(
      context,
      validateCreateInput(input),
    );
  }

  async getOwnReview(
    context: AuthContext,
    reviewId: number,
  ): Promise<Review | null> {
    assertRole(context, 'customer');

    return this.repository.getOwnReview(
      context,
      validatePositiveId(reviewId, 'reviewId'),
    );
  }

  async getPublicReviews(
    businessId: number,
    limit?: number,
  ): Promise<readonly Review[]> {
    return this.repository.getPublicReviews(
      validatePositiveId(businessId, 'businessId'),
      validateLimit(limit, 20),
    );
  }

  async getPendingReviews(
    context: AuthContext,
    limit?: number,
  ): Promise<readonly Review[]> {
    assertRole(context, 'admin');

    return this.repository.getPendingReviews(
      context,
      validateLimit(limit, 50),
    );
  }

  async moderateReview(
    context: AuthContext,
    reviewId: number,
    input: ModerateReviewInput,
  ): Promise<Review> {
    assertRole(context, 'admin');

    return this.repository.moderateReview(
      context,
      validatePositiveId(reviewId, 'reviewId'),
      validateModerationInput(input),
    );
  }
}

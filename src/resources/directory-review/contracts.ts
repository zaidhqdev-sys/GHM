import type { AuthContext } from '../../auth/authorization';

export type DirectoryReviewStatus = 'unverified' | 'under_review' | 'information_requested' | 'approved' | 'rejected';

export interface DirectoryReviewPresentation {
  readonly business_id: number;
  readonly verification_status: DirectoryReviewStatus;
  readonly is_verified: boolean;
  readonly directory_review_submitted_at: Date | null;
  readonly directory_review_last_reason: string | null;
  readonly directory_review_last_event_type: string | null;
}

export interface DirectoryReviewRepository {
  getPresentation(context: AuthContext, businessId: number): Promise<DirectoryReviewPresentation>;
}

export interface DirectoryReviewService extends DirectoryReviewRepository {}

export const DIRECTORY_REVIEW_OPERATIONS = Object.freeze({
  read: 'directory_review.read',
});

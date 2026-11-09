import type { AuthContext } from '../../auth/authorization';

export type DirectoryReviewStatus = 'unverified' | 'under_review' | 'information_requested' | 'approved' | 'rejected';
export type DirectoryReviewDecision = 'approve' | 'reject' | 'request_information';

export interface DirectoryReviewBusiness {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly verification_status: DirectoryReviewStatus;
  readonly is_verified: boolean;
  readonly is_active: boolean;
  readonly directory_review_submitted_at: Date | null;
  readonly directory_review_last_reason: string | null;
  readonly directory_review_last_event_type: string | null;
  readonly owner_account_id: number | null;
  readonly owner_full_name: string | null;
  readonly registration_status: 'registered' | 'unregistered' | null;
  readonly registration_number: string | null;
  readonly legal_name: string | null;
  readonly created_at: Date;
}

export interface DirectoryReviewPresentation {
  readonly business_id: number;
  readonly verification_status: DirectoryReviewStatus;
  readonly is_verified: boolean;
  readonly directory_review_submitted_at: Date | null;
  readonly directory_review_last_reason: string | null;
  readonly directory_review_last_event_type: string | null;
}

export interface DirectoryReviewRepository {
  submit(context: AuthContext, businessId: number): Promise<DirectoryReviewPresentation>;
  list(context: AuthContext, options: { status: DirectoryReviewStatus | null; limit: number; offset: number }): Promise<DirectoryReviewBusiness[]>;
  review(context: AuthContext, businessId: number, decision: DirectoryReviewDecision, reason: string | null): Promise<DirectoryReviewPresentation>;
  getPresentation(context: AuthContext, businessId: number): Promise<DirectoryReviewPresentation>;
}

export interface DirectoryReviewService extends DirectoryReviewRepository {}

export const DIRECTORY_REVIEW_OPERATIONS = Object.freeze({
  read: 'directory_review.read',
  submit: 'directory_review.submit',
  decide: 'directory_review.decide',
});

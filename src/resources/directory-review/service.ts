import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type { DirectoryReviewDecision, DirectoryReviewPresentation, DirectoryReviewRepository, DirectoryReviewService, DirectoryReviewStatus } from './contracts';

const positiveId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('Business ID must be a positive integer');
  return value as number;
};

const validStatuses: readonly DirectoryReviewStatus[] = ['under_review','information_requested','rejected','approved','unverified'];
const validDecisions: readonly DirectoryReviewDecision[] = ['approve','reject','request_information'];

export class DirectoryReviewServiceImpl implements DirectoryReviewService {
  constructor(private readonly repository: DirectoryReviewRepository) {}

  async isFounderReviewer(context: AuthContext): Promise<boolean> {
    requireAuthenticatedContext(context);
    return this.repository.isFounderReviewer(context);
  }

  async submit(context: AuthContext, businessId: number): Promise<DirectoryReviewPresentation> {
    requireAuthenticatedContext(context);
    return this.repository.submit(context, positiveId(businessId));
  }

  async list(context: AuthContext, options: { status: DirectoryReviewStatus | null; limit: number; offset: number }) {
    requireAuthenticatedContext(context);
    if (!options || (options.status !== null && !validStatuses.includes(options.status))) throw new Error('Invalid directory review status');
    if (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100) throw new Error('Directory review limit must be between 1 and 100');
    if (!Number.isSafeInteger(options.offset) || options.offset < 0) throw new Error('Directory review offset must be zero or greater');
    return this.repository.list(context, options);
  }

  async review(context: AuthContext, businessId: number, decision: DirectoryReviewDecision, reason: string | null): Promise<DirectoryReviewPresentation> {
    requireAuthenticatedContext(context);
    const id = positiveId(businessId);
    if (!validDecisions.includes(decision)) throw new Error('Invalid directory review decision');
    const normalizedReason = typeof reason === 'string' ? reason.trim() : null;
    if (decision !== 'approve' && (!normalizedReason || normalizedReason.length > 1000)) {
      throw new Error('A reason between 1 and 1000 characters is required');
    }
    if (decision === 'approve' && normalizedReason && normalizedReason.length > 1000) throw new Error('Directory review reason is too long');
    return this.repository.review(context, id, decision, decision === 'approve' ? null : normalizedReason);
  }

  async getPresentation(context: AuthContext, businessId: number): Promise<DirectoryReviewPresentation> {
    requireAuthenticatedContext(context);
    return this.repository.getPresentation(context, positiveId(businessId));
  }
}

import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type { DirectoryReviewPresentation, DirectoryReviewRepository, DirectoryReviewService } from './contracts';

const positiveId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('Business ID must be a positive integer');
  return value as number;
};

export class DirectoryReviewServiceImpl implements DirectoryReviewService {
  constructor(private readonly repository: DirectoryReviewRepository) {}

  async getPresentation(context: AuthContext, businessId: number): Promise<DirectoryReviewPresentation> {
    requireAuthenticatedContext(context);
    return this.repository.getPresentation(context, positiveId(businessId));
  }
}

import type {
  PublicBusiness,
  PublicBusinessRepository,
  PublicBusinessService,
} from './public-contracts';

export class PublicBusinessServiceImpl implements PublicBusinessService {
  constructor(private readonly repository: PublicBusinessRepository) {}

  async getPublicBusiness(businessId: number): Promise<PublicBusiness | null> {
    if (!Number.isSafeInteger(businessId) || businessId <= 0) {
      throw new Error('Invalid Business id');
    }
    return this.repository.getPublicBusiness(businessId);
  }

  async getPublicBusinessBySlug(slug: string): Promise<PublicBusiness | null> {
    const normalized = slug.trim();
    if (!normalized) {
      throw new Error('Invalid Business slug');
    }
    return this.repository.getPublicBusinessBySlug(normalized);
  }
}

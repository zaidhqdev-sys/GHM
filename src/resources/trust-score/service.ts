import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type {
  BusinessId,
  TrustLevel,
  TrustScore,
  TrustScoreRepository,
  TrustScoreService,
} from './contracts';

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const requireTrustLevel = (value: unknown): TrustLevel => {
  if (value !== 'bronze' && value !== 'silver' && value !== 'gold' && value !== 'platinum') {
    throw new Error('trustLevel must be bronze, silver, gold, or platinum');
  }
  return value;
};

export class TrustScoreServiceImpl implements TrustScoreService {
  constructor(private readonly repository: TrustScoreRepository) {}

  async getPublicTrustScore(businessId: BusinessId): Promise<TrustScore | null> {
    return this.repository.getPublicTrustScore(requirePositiveId(businessId, 'businessId'));
  }

  async getTrustScore(context: AuthContext, businessId: BusinessId): Promise<TrustScore | null> {
    requireAuthenticatedContext(context);
    return this.repository.getTrustScore(context, requirePositiveId(businessId, 'businessId'));
  }

  async listPublicByTrustLevel(trustLevel: TrustLevel): Promise<TrustScore[]> {
    return this.repository.listPublicByTrustLevel(requireTrustLevel(trustLevel));
  }

  async listByTrustLevel(context: AuthContext, trustLevel: TrustLevel): Promise<TrustScore[]> {
    requireAuthenticatedContext(context);
    return this.repository.listByTrustLevel(context, requireTrustLevel(trustLevel));
  }

  async calculateTrustScore(context: AuthContext, businessId: BusinessId): Promise<TrustScore> {
    requireAuthenticatedContext(context);
    return this.repository.calculateTrustScore(context, requirePositiveId(businessId, 'businessId'));
  }
}

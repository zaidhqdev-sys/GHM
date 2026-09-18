import type { AuthContext } from '../../auth/authorization';

export type TrustScoreId = number;
export type BusinessId = number;
export type AccountId = number;

export type TrustLevel = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface TrustScore {
  readonly id: TrustScoreId;
  readonly businessId: BusinessId;
  readonly profileComplete: number;
  readonly phoneVerified: number;
  readonly emailVerified: number;
  readonly idVerified: number;
  readonly cipcVerified: number;
  readonly vatVerified: number;
  readonly insuranceVerified: number;
  readonly reviewsScore: number;
  readonly completedProjects: number;
  readonly totalScore: number;
  readonly trustLevel: TrustLevel;
  readonly lastUpdated: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TrustScoreRepository {
  getPublicTrustScore(businessId: BusinessId): Promise<TrustScore | null>;
  getTrustScore(context: AuthContext, businessId: BusinessId): Promise<TrustScore | null>;
  listPublicByTrustLevel(trustLevel: TrustLevel): Promise<TrustScore[]>;
  listByTrustLevel(context: AuthContext, trustLevel: TrustLevel): Promise<TrustScore[]>;
  calculateTrustScore(context: AuthContext, businessId: BusinessId): Promise<TrustScore>;
}

export interface TrustScoreService extends TrustScoreRepository {}

export const TRUST_SCORE_OPERATIONS = Object.freeze({
  readPublic: 'trust_score.readPublic',
  read: 'trust_score.read',
  calculate: 'trust_score.calculate',
});

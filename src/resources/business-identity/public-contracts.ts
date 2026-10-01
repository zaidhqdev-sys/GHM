import type { BusinessVerificationStatus } from './contracts';

export interface PublicBusiness {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly rating: number;
  readonly reviewCount: number;
  readonly jobsCompleted: number;
  readonly verificationStatus: BusinessVerificationStatus;
  readonly isVerified: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicBusinessRepository {
  getPublicBusiness(businessId: number): Promise<PublicBusiness | null>;
  getPublicBusinessBySlug(slug: string): Promise<PublicBusiness | null>;
}

export interface PublicBusinessService {
  getPublicBusiness(businessId: number): Promise<PublicBusiness | null>;
  getPublicBusinessBySlug(slug: string): Promise<PublicBusiness | null>;
}

export const BUSINESS_PUBLIC_OPERATION = 'readPublic' as const;

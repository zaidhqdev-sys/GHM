import type { BusinessVerificationStatus } from './contracts';

export interface PublicBusiness {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly category: string | null;
  readonly province: string | null;
  readonly city: string | null;
  readonly physicalAddress: string | null;
  readonly whatsapp: string | null;
  readonly website: string | null;
  readonly logoUrl: string | null;
  readonly avatarLetter: string | null;
  readonly avatarColor: string | null;
  readonly isSupplier: boolean;
  readonly tier: 'free' | 'verified' | 'featured' | 'premium';
  readonly isFeatured: boolean;
  readonly profileViews: number;
  readonly yearsInBusiness: number;
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

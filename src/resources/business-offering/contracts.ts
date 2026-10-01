import type { AuthContext } from '../../auth/authorization.js';

export type BusinessOfferingId = string;
export type BusinessId = number;
export type AccountId = number;

export type BusinessOfferingType = 'service' | 'product' | 'solution';

export interface BusinessOffering {
  readonly id: BusinessOfferingId;
  readonly businessId: BusinessId;
  readonly offeringType: BusinessOfferingType;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly priceAmount: string | null;
  readonly currencyCode: string;
  readonly priceUnit: string | null;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly createdBy: AccountId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ListBusinessOfferingsInput {
  readonly businessId: BusinessId;
  readonly activeOnly?: boolean;
}

export interface CreateBusinessOfferingInput {
  readonly businessId: BusinessId;
  readonly offeringType?: BusinessOfferingType;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | null;
  readonly priceAmount?: string | null;
  readonly currencyCode?: string;
  readonly priceUnit?: string | null;
  readonly sortOrder?: number;
}

export interface UpdateBusinessOfferingInput {
  readonly offeringType?: BusinessOfferingType;
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string | null;
  readonly priceAmount?: string | null;
  readonly currencyCode?: string;
  readonly priceUnit?: string | null;
  readonly isActive?: boolean;
  readonly sortOrder?: number;
}

export interface BusinessOfferingRepository {
  listBusinessOfferings(context: AuthContext, input: ListBusinessOfferingsInput): Promise<BusinessOffering[]>;
  getBusinessOfferingBySlug(context: AuthContext, businessId: BusinessId, slug: string): Promise<BusinessOffering | null>;
  createBusinessOffering(context: AuthContext, input: CreateBusinessOfferingInput): Promise<BusinessOffering>;
  updateBusinessOffering(context: AuthContext, offeringId: BusinessOfferingId, input: UpdateBusinessOfferingInput): Promise<BusinessOffering>;
  listPublicBusinessOfferings(businessId: BusinessId): Promise<BusinessOffering[]>;
}

export interface BusinessOfferingService extends BusinessOfferingRepository {}

export const BUSINESS_OFFERING_OPERATIONS = Object.freeze({
  read: 'business_offering.read',
  readPublic: 'business_offering.readPublic',
  create: 'business_offering.create',
  update: 'business_offering.update',
} as const);

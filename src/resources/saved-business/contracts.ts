import type { AuthContext } from '../../auth/authorization';

export type SavedBusinessId = number;
export type BusinessId = number;
export type AccountId = number;

export interface SavedBusinessPublicBusiness {
  readonly id: BusinessId;
  readonly name: string;
  readonly slug: string;
  readonly verificationStatus: string;
  readonly isVerified: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly rating: number | null;
  readonly reviewCount: number;
}

export interface SavedBusiness {
  readonly id: SavedBusinessId;
  readonly accountId: AccountId;
  readonly businessId: BusinessId;
  readonly createdAt: Date;
  readonly business: SavedBusinessPublicBusiness;
}

export interface CreateSavedBusinessInput {
  readonly businessId: BusinessId;
}

export interface SavedBusinessRepository {
  createSavedBusiness(context: AuthContext, input: CreateSavedBusinessInput): Promise<SavedBusiness>;
  getSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<SavedBusiness | null>;
  listSavedBusinesses(context: AuthContext): Promise<SavedBusiness[]>;
  deleteSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<SavedBusiness>;
}

export interface SavedBusinessService {
  createSavedBusiness(context: AuthContext, input: CreateSavedBusinessInput): Promise<SavedBusiness>;
  getSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<SavedBusiness | null>;
  listSavedBusinesses(context: AuthContext): Promise<SavedBusiness[]>;
  deleteSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<SavedBusiness>;
}

export const SAVED_BUSINESS_OPERATIONS = Object.freeze({
  read: 'savedBusiness.read',
  create: 'savedBusiness.create',
  delete: 'savedBusiness.delete',
});

import type { AuthContext } from '../../auth/authorization';

export type SavedBusinessId = number;
export type AccountId = number;
export type BusinessId = number;

export interface SavedBusiness {
  readonly id: SavedBusinessId;
  readonly accountId: AccountId;
  readonly businessId: BusinessId;
  readonly createdAt: Date;
}

export interface CreateSavedBusinessInput {
  readonly businessId: BusinessId;
}

export interface SavedBusinessRepository {
  createSavedBusiness(context: AuthContext, input: CreateSavedBusinessInput): Promise<SavedBusiness>;
  getSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<SavedBusiness | null>;
  listSavedBusinesses(context: AuthContext): Promise<SavedBusiness[]>;
  deleteSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<void>;
}

export interface SavedBusinessService extends SavedBusinessRepository {}

export const SAVED_BUSINESS_OPERATIONS = Object.freeze({
  read: 'saved_business.read',
  create: 'saved_business.create',
  delete: 'saved_business.delete',
});

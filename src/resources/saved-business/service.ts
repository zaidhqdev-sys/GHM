import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type {
  CreateSavedBusinessInput,
  SavedBusiness,
  SavedBusinessId,
  SavedBusinessRepository,
  SavedBusinessService,
} from './contracts';

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const validateCreate = (context: AuthContext, input: CreateSavedBusinessInput): CreateSavedBusinessInput => {
  requireAuthenticatedContext(context);
  if (!input || typeof input !== 'object') throw new Error('Saved Business input is required');
  requirePositiveId(input.businessId, 'businessId');
  return input;
};

export class SavedBusinessServiceImpl implements SavedBusinessService {
  constructor(private readonly repository: SavedBusinessRepository) {}

  async createSavedBusiness(context: AuthContext, input: CreateSavedBusinessInput): Promise<SavedBusiness> {
    return this.repository.createSavedBusiness(context, validateCreate(context, input));
  }

  async getSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<SavedBusiness | null> {
    requireAuthenticatedContext(context);
    requirePositiveId(savedBusinessId, 'savedBusinessId');
    return this.repository.getSavedBusiness(context, savedBusinessId);
  }

  async listSavedBusinesses(context: AuthContext): Promise<SavedBusiness[]> {
    requireAuthenticatedContext(context);
    return this.repository.listSavedBusinesses(context);
  }

  async deleteSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<void> {
    requireAuthenticatedContext(context);
    requirePositiveId(savedBusinessId, 'savedBusinessId');
    return this.repository.deleteSavedBusiness(context, savedBusinessId);
  }
}

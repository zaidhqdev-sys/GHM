import type { AuthContext } from '../../auth/authorization';
import type {
  CreateSavedBusinessInput,
  SavedBusiness,
  SavedBusinessRepository,
  SavedBusinessService,
} from './contracts';

const assertPositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`Invalid ${field}`);
  return value as number;
};

const validateCreateInput = (input: CreateSavedBusinessInput): CreateSavedBusinessInput => {
  if (!input || typeof input !== 'object') throw new Error('Saved Business input is required');
  return { businessId: assertPositiveId(input.businessId, 'businessId') };
};

export class SavedBusinessServiceImpl implements SavedBusinessService {
  constructor(private readonly repository: SavedBusinessRepository) {}

  async createSavedBusiness(context: AuthContext, input: CreateSavedBusinessInput): Promise<SavedBusiness> {
    return this.repository.createSavedBusiness(context, validateCreateInput(input));
  }

  async getSavedBusiness(context: AuthContext, savedBusinessId: number): Promise<SavedBusiness | null> {
    return this.repository.getSavedBusiness(context, assertPositiveId(savedBusinessId, 'savedBusinessId'));
  }

  async listSavedBusinesses(context: AuthContext): Promise<SavedBusiness[]> {
    return this.repository.listSavedBusinesses(context);
  }

  async deleteSavedBusiness(context: AuthContext, savedBusinessId: number): Promise<SavedBusiness> {
    return this.repository.deleteSavedBusiness(context, assertPositiveId(savedBusinessId, 'savedBusinessId'));
  }
}

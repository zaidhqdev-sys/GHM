import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization.js';
import type {
  AssignBusinessCategoryInput,
  BusinessCategory,
  BusinessCategoryAssignment,
  BusinessCategoryId,
  BusinessCategoryRepository,
  BusinessCategoryService,
  BusinessId,
  ListBusinessCategoriesFilter,
  SetPrimaryBusinessCategoryInput,
} from './contracts.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const requireUuid = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw new Error(`${field} must be a valid UUID`);
  return value;
};

const validateAssignmentInput = (context: AuthContext, input: AssignBusinessCategoryInput | SetPrimaryBusinessCategoryInput): void => {
  requireAuthenticatedContext(context);
  if (!input || typeof input !== 'object') throw new Error('Category input is required');
  requirePositiveId(input.businessId, 'businessId');
  requireUuid(input.categoryId, 'categoryId');
};

export class BusinessCategoryServiceImpl implements BusinessCategoryService {
  constructor(private readonly repository: BusinessCategoryRepository) {}

  listBusinessCategories(context: AuthContext, filter: ListBusinessCategoriesFilter = {}): Promise<BusinessCategory[]> {
    requireAuthenticatedContext(context);
    if (typeof filter.activeOnly !== 'undefined' && typeof filter.activeOnly !== 'boolean') throw new Error('activeOnly must be boolean');
    return this.repository.listBusinessCategories(context, filter);
  }

  getBusinessCategory(context: AuthContext, categoryId: BusinessCategoryId): Promise<BusinessCategory | null> {
    requireAuthenticatedContext(context);
    requireUuid(categoryId, 'categoryId');
    return this.repository.getBusinessCategory(context, categoryId);
  }

  listBusinessCategoryAssignments(context: AuthContext, businessId: BusinessId): Promise<BusinessCategoryAssignment[]> {
    requireAuthenticatedContext(context);
    requirePositiveId(businessId, 'businessId');
    return this.repository.listBusinessCategoryAssignments(context, businessId);
  }

  assignBusinessCategory(context: AuthContext, input: AssignBusinessCategoryInput): Promise<BusinessCategoryAssignment> {
    validateAssignmentInput(context, input);
    return this.repository.assignBusinessCategory(context, input);
  }

  setPrimaryBusinessCategory(context: AuthContext, input: SetPrimaryBusinessCategoryInput): Promise<BusinessCategoryAssignment> {
    validateAssignmentInput(context, input);
    return this.repository.setPrimaryBusinessCategory(context, input);
  }
}

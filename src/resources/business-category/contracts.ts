import type { AuthContext } from '../../auth/authorization.js';

export type BusinessCategoryId = string;
export type BusinessCategoryAssignmentId = number;
export type BusinessId = number;
export type AccountId = number;

export interface BusinessCategory {
  readonly id: BusinessCategoryId;
  readonly parentId: BusinessCategoryId | null;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BusinessCategoryAssignment {
  readonly id: BusinessCategoryAssignmentId;
  readonly businessId: BusinessId;
  readonly categoryId: BusinessCategoryId;
  readonly isPrimary: boolean;
  readonly createdBy: AccountId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ListBusinessCategoriesFilter {
  readonly activeOnly?: boolean;
}

export interface AssignBusinessCategoryInput {
  readonly businessId: BusinessId;
  readonly categoryId: BusinessCategoryId;
}

export interface SetPrimaryBusinessCategoryInput {
  readonly businessId: BusinessId;
  readonly categoryId: BusinessCategoryId;
}

export interface BusinessCategoryRepository {
  listBusinessCategories(context: AuthContext, filter?: ListBusinessCategoriesFilter): Promise<BusinessCategory[]>;
  getBusinessCategory(context: AuthContext, categoryId: BusinessCategoryId): Promise<BusinessCategory | null>;
  listBusinessCategoryAssignments(context: AuthContext, businessId: BusinessId): Promise<BusinessCategoryAssignment[]>;
  assignBusinessCategory(context: AuthContext, input: AssignBusinessCategoryInput): Promise<BusinessCategoryAssignment>;
  setPrimaryBusinessCategory(context: AuthContext, input: SetPrimaryBusinessCategoryInput): Promise<BusinessCategoryAssignment>;
}

export interface BusinessCategoryService extends BusinessCategoryRepository {}

export const BUSINESS_CATEGORY_OPERATIONS = Object.freeze({
  READ: 'business_category.read',
  ASSIGNMENT_READ: 'business_category_assignment.read',
  ASSIGN: 'business_category_assignment.create',
  SET_PRIMARY: 'business_category_assignment.update_primary',
} as const);

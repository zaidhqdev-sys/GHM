import type { AuthContext } from '../../auth/authorization';
import type {
  CreateProjectInput,
  Project,
  ProjectRepository,
  ProjectService,
  UpdateProjectInput,
} from './contracts';

const validateText = (
  value: unknown,
  field: string,
  min: number,
  max: number,
): string => {
  if (typeof value !== 'string') {
    throw new Error(`${field} is required`);
  }

  const normalized = value.trim();

  if (normalized.length < min || normalized.length > max) {
    throw new Error(`${field} must be between ${min} and ${max} characters`);
  }

  return normalized;
};

const validateBudgetValue = (
  value: unknown,
  field: string,
): number | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${field} must be null or a non-negative number`,
    );
  }

  return value;
};

const validateBudgetRange = (
  budgetMin: number | null | undefined,
  budgetMax: number | null | undefined,
): void => {
  if (
    budgetMin !== undefined &&
    budgetMin !== null &&
    budgetMax !== undefined &&
    budgetMax !== null &&
    budgetMax < budgetMin
  ) {
    throw new Error(
      'budgetMax must be greater than or equal to budgetMin',
    );
  }
};

const validateUrgency = (urgency: unknown): void => {
  if (
    urgency !== 'standard' &&
    urgency !== 'urgent' &&
    urgency !== 'emergency'
  ) {
    throw new Error('Invalid Project urgency');
  }
};

const validateCreateInput = (
  input: CreateProjectInput,
): CreateProjectInput => {
  const title = validateText(input.title, 'title', 5, 160);
  const description = validateText(
    input.description,
    'description',
    20,
    5000,
  );
  const category = validateText(input.category, 'category', 2, 80);
  const province = validateText(input.province, 'province', 2, 80);
  const city = validateText(input.city, 'city', 2, 120);

  const budgetMin = validateBudgetValue(input.budgetMin, 'budgetMin');
  const budgetMax = validateBudgetValue(input.budgetMax, 'budgetMax');
  const urgency = input.urgency ?? 'standard';

  validateUrgency(urgency);
  validateBudgetRange(budgetMin, budgetMax);

  return {
    title,
    description,
    category,
    province,
    city,
    budgetMin: budgetMin ?? null,
    budgetMax: budgetMax ?? null,
    urgency,
  };
};

const validateUpdateInput = (
  input: UpdateProjectInput,
): UpdateProjectInput => {
  const allowed = new Set([
    'title',
    'description',
    'category',
    'province',
    'city',
    'budgetMin',
    'budgetMax',
    'urgency',
  ]);

  const entries = Object.entries(input).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error('Project update requires at least one field');
  }

  const unsupported = entries.find(([key]) => !allowed.has(key));

  if (unsupported) {
    throw new Error(
      `Unsupported Project update field: ${unsupported[0]}`,
    );
  }

  if (Object.hasOwn(input, 'title')) {
    validateText(input.title, 'title', 5, 160);
  }

  if (Object.hasOwn(input, 'description')) {
    validateText(input.description, 'description', 20, 5000);
  }

  if (Object.hasOwn(input, 'category')) {
    validateText(input.category, 'category', 2, 80);
  }

  if (Object.hasOwn(input, 'province')) {
    validateText(input.province, 'province', 2, 80);
  }

  if (Object.hasOwn(input, 'city')) {
    validateText(input.city, 'city', 2, 120);
  }

  const budgetMin = validateBudgetValue(input.budgetMin, 'budgetMin');
  const budgetMax = validateBudgetValue(input.budgetMax, 'budgetMax');

  validateBudgetRange(budgetMin, budgetMax);

  if (Object.hasOwn(input, 'urgency')) {
    validateUrgency(input.urgency);
  }

  return {
    ...input,
    ...(Object.hasOwn(input, 'title')
      ? { title: input.title!.trim() }
      : {}),
    ...(Object.hasOwn(input, 'description')
      ? { description: input.description!.trim() }
      : {}),
    ...(Object.hasOwn(input, 'category')
      ? { category: input.category!.trim() }
      : {}),
    ...(Object.hasOwn(input, 'province')
      ? { province: input.province!.trim() }
      : {}),
    ...(Object.hasOwn(input, 'city')
      ? { city: input.city!.trim() }
      : {}),
  };
};

export class ProjectServiceImpl implements ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  async createProject(
    context: AuthContext,
    input: CreateProjectInput,
  ): Promise<Project> {
    return this.repository.createProject(
      context,
      validateCreateInput(input),
    );
  }

  async getOwnedProject(
    context: AuthContext,
    projectId: number,
  ): Promise<Project | null> {
    return this.repository.getOwnedProject(context, projectId);
  }

  async updateOwnedProject(
    context: AuthContext,
    projectId: number,
    input: UpdateProjectInput,
  ): Promise<Project> {
    return this.repository.updateOwnedProject(
      context,
      projectId,
      validateUpdateInput(input),
    );
  }
}

import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  CreateProjectInput,
  Project,
  ProjectPage,
  ProjectRepository,
  UpdateProjectInput,
} from './contracts';

const PROJECT_COLUMNS = `
  id,
  account_id,
  opportunity_id,
  title,
  description,
  category,
  province,
  city,
  budget_min,
  budget_max,
  urgency,
  status,
  created_at,
  updated_at
`;

const mapProject = (row: any): Project => ({
  id: Number(row.id),
  ...(row.quote_count !== undefined ? { quoteCount: Number(row.quote_count) } : {}),
  accountId: Number(row.account_id),
  opportunityId: row.opportunity_id == null ? null : Number(row.opportunity_id),
  title: row.title,
  description: row.description,
  category: row.category,
  province: row.province,
  city: row.city,
  budgetMin: row.budget_min === null ? null : Number(row.budget_min),
  budgetMax: row.budget_max === null ? null : Number(row.budget_max),
  urgency: row.urgency,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const normalizeRequiredText = (
  value: string | undefined,
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

const validateBudget = (
  budgetMin: number | null | undefined,
  budgetMax: number | null | undefined,
): void => {
  if (
    budgetMin !== undefined &&
    budgetMin !== null &&
    (typeof budgetMin !== 'number' || !Number.isFinite(budgetMin) || budgetMin < 0)
  ) {
    throw new Error('budgetMin must be null or a non-negative number');
  }

  if (
    budgetMax !== undefined &&
    budgetMax !== null &&
    (typeof budgetMax !== 'number' || !Number.isFinite(budgetMax) || budgetMax < 0)
  ) {
    throw new Error('budgetMax must be null or a non-negative number');
  }

  if (
    budgetMin !== undefined &&
    budgetMin !== null &&
    budgetMax !== undefined &&
    budgetMax !== null &&
    budgetMax < budgetMin
  ) {
    throw new Error('budgetMax must be greater than or equal to budgetMin');
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

const normalizeCreateInput = (input: CreateProjectInput) => {
  const title = normalizeRequiredText(input.title, 'title', 5, 160);
  const description = normalizeRequiredText(
    input.description,
    'description',
    20,
    5000,
  );
  const category = normalizeRequiredText(input.category, 'category', 2, 80);
  const province = normalizeRequiredText(input.province, 'province', 2, 80);
  const city = normalizeRequiredText(input.city, 'city', 2, 120);
  const urgency = input.urgency ?? 'standard';

  validateUrgency(urgency);
  validateBudget(input.budgetMin, input.budgetMax);

  return {
    title,
    description,
    category,
    province,
    city,
    budgetMin: input.budgetMin ?? null,
    budgetMax: input.budgetMax ?? null,
    urgency,
  };
};

const normalizeUpdateInput = (input: UpdateProjectInput) => {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);

  if (entries.length === 0) {
    throw new Error('Project update requires at least one field');
  }

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

  const unsupported = entries.find(([key]) => !allowed.has(key));

  if (unsupported) {
    throw new Error(`Unsupported Project update field: ${unsupported[0]}`);
  }

  const result: Record<string, unknown> = {};

  if (Object.hasOwn(input, 'title')) {
    result.title = normalizeRequiredText(input.title, 'title', 5, 160);
  }

  if (Object.hasOwn(input, 'description')) {
    result.description = normalizeRequiredText(
      input.description,
      'description',
      20,
      5000,
    );
  }

  if (Object.hasOwn(input, 'category')) {
    result.category = normalizeRequiredText(input.category, 'category', 2, 80);
  }

  if (Object.hasOwn(input, 'province')) {
    result.province = normalizeRequiredText(input.province, 'province', 2, 80);
  }

  if (Object.hasOwn(input, 'city')) {
    result.city = normalizeRequiredText(input.city, 'city', 2, 120);
  }

  if (Object.hasOwn(input, 'budgetMin')) {
    result.budgetMin = input.budgetMin ?? null;
  }

  if (Object.hasOwn(input, 'budgetMax')) {
    result.budgetMax = input.budgetMax ?? null;
  }

  if (Object.hasOwn(input, 'urgency')) {
    validateUrgency(input.urgency);
    result.urgency = input.urgency;
  }

  validateBudget(
    Object.hasOwn(result, 'budgetMin')
      ? (result.budgetMin as number | null)
      : undefined,
    Object.hasOwn(result, 'budgetMax')
      ? (result.budgetMax as number | null)
      : undefined,
  );

  return result;
};

const findOwnedProject = async (
  client: PoolClient,
  context: AuthContext,
  projectId: number,
): Promise<Project | null> => {
  const result = await client.query(
    `SELECT ${PROJECT_COLUMNS}
     FROM ghm.project
     WHERE id = $1
       AND account_id = $2`,
    [projectId, context.userId],
  );

  return result.rowCount === 1 ? mapProject(result.rows[0]) : null;
};

/**
 * Internal cross-resource lifecycle capability.
 *
 * This is intentionally not part of ProjectRepository. It exists only for
 * governed operations that already own an authorized transaction, currently
 * Project Quote acceptance.
 */
export const transitionOpenProjectToInProgress = async (
  client: PoolClient,
  context: AuthContext,
  projectId: number,
): Promise<Project> => {
  const result = await client.query(
    `UPDATE ghm.project
     SET
       status = 'in_progress',
       updated_at = now()
     WHERE id = $1
       AND account_id = $2
       AND status = 'open'
     RETURNING ${PROJECT_COLUMNS}`,
    [projectId, context.userId],
  );

  if (result.rowCount !== 1) {
    throw new Error('Project transition open -> in_progress failed');
  }

  return mapProject(result.rows[0]);
};
export class PostgresProjectRepository implements ProjectRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async listOwnedProjects(
    context: AuthContext,
    limit: number,
    offset: number,
  ): Promise<ProjectPage> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid Project page limit');
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid Project page offset');
    return withAuthorizedTransaction(
      context,
      async client => {
        const count = await client.query(
          'SELECT count(*)::int AS total FROM ghm.project WHERE account_id = $1',
          [context.userId],
        );
        const result = await client.query(
          `SELECT ${PROJECT_COLUMNS},
             (SELECT count(*)::int FROM ghm.project_quote pq WHERE pq.project_id = ghm.project.id) AS quote_count
           FROM ghm.project
           WHERE account_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT $2 OFFSET $3`,
          [context.userId, limit, offset],
        );
        return {
          projects: result.rows.map(mapProject),
          total: Number(count.rows[0]?.total ?? 0),
          limit,
          offset,
        };
      },
      this.transactionPool,
    );
  }

  async createProject(
    context: AuthContext,
    input: CreateProjectInput,
  ): Promise<Project> {
    const normalized = normalizeCreateInput(input);

    return withAuthorizedTransaction(
      context,
      async client => {
        const projectType = await client.query(
          `SELECT id FROM ghm.opportunity_type
           WHERE code = 'project' AND is_active = true
           ORDER BY version DESC LIMIT 1`,
        );
        if (projectType.rowCount !== 1) {
          throw new Error('Project Opportunity type not found or inactive');
        }
        const opportunityResult = await client.query(
          `INSERT INTO ghm.opportunity (
             opportunity_type_id, creator_account_id, title, description,
             lifecycle_status, visibility, budget_min, budget_max
           ) VALUES ($1, $2, $3, $4, 'open', 'authenticated', $5, $6)
           RETURNING id`,
          [projectType.rows[0].id, context.userId, normalized.title, normalized.description, normalized.budgetMin, normalized.budgetMax],
        );
        if (opportunityResult.rowCount !== 1) {
          throw new Error('Project Opportunity creation failed');
        }
        const opportunityId = Number(opportunityResult.rows[0].id);
        await client.query(
          `INSERT INTO ghm.opportunity_participant
           (opportunity_id, account_id, business_id, participation_role, participation_status, created_by)
           VALUES ($1, $2, NULL, 'creator', 'active', $2)`,
          [opportunityId, context.userId],
        );
        const result = await client.query(
          `INSERT INTO ghm.project (
             account_id, opportunity_id, title, description, category, province,
             city, budget_min, budget_max, urgency
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING ${PROJECT_COLUMNS}`,
          [
            context.userId, opportunityId, normalized.title, normalized.description,
            normalized.category, normalized.province, normalized.city,
            normalized.budgetMin, normalized.budgetMax, normalized.urgency,
          ],
        );

        if (result.rowCount !== 1) {
          throw new Error('Project creation failed');
        }

        return mapProject(result.rows[0]);
      },
      this.transactionPool,
    );
  }

  async getOwnedProject(
    context: AuthContext,
    projectId: number,
  ): Promise<Project | null> {
    return withAuthorizedTransaction(
      context,
      client => findOwnedProject(client, context, projectId),
      this.transactionPool,
    );
  }

  async updateOwnedProject(
    context: AuthContext,
    projectId: number,
    input: UpdateProjectInput,
  ): Promise<Project> {
    const normalized = normalizeUpdateInput(input);

    return withAuthorizedTransaction(
      context,
      async client => {
        const fields: string[] = [];
        const values: unknown[] = [projectId, context.userId];
        let parameter = 3;

        const columnMap: Record<string, string> = {
          title: 'title',
          description: 'description',
          category: 'category',
          province: 'province',
          city: 'city',
          budgetMin: 'budget_min',
          budgetMax: 'budget_max',
          urgency: 'urgency',
        };

        for (const [key, column] of Object.entries(columnMap)) {
          if (Object.hasOwn(normalized, key)) {
            fields.push(`${column} = $${parameter}`);
            values.push(normalized[key]);
            parameter += 1;
          }
        }

        fields.push('updated_at = now()');

        const result = await client.query(
          `UPDATE ghm.project
           SET ${fields.join(', ')}
           WHERE id = $1
             AND account_id = $2
             AND status = 'open'
           RETURNING ${PROJECT_COLUMNS}`,
          values,
        );

        if (result.rowCount !== 1) {
          const existing = await findOwnedProject(client, context, projectId);

          if (!existing) {
            throw new Error('Project not found or ownership required');
          }

          if (existing.status !== 'open') {
            throw new Error('Only open Projects may be updated');
          }

          throw new Error('Project update failed');
        }

        return mapProject(result.rows[0]);
      },
      this.transactionPool,
    );
  }
}

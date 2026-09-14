import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import { transitionOpenProjectToInProgress } from '../project/repository';
import type {
  BusinessId,
  CreateProjectQuoteInput,
  ProjectQuote,
  ProjectQuoteDecision,
  ProjectQuoteId,
  ProjectQuoteRepository,
  UpdateProjectQuoteInput,
} from './contracts';

const PROJECT_QUOTE_COLUMNS = `
  id,
  project_id,
  business_id,
  amount,
  labour_min,
  labour_max,
  materials_min,
  materials_max,
  total_min,
  total_max,
  duration_days,
  description,
  status,
  created_at,
  updated_at
`;

const assertPositiveId = (id: number, field: string): void => {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`Invalid ${field}`);
  }
};

const assertFiniteNonNegative = (
  value: number | null | undefined,
  field: string,
): void => {
  if (value === undefined || value === null) {
    return;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${field}`);
  }
};

const assertRange = (
  minimum: number | null | undefined,
  maximum: number | null | undefined,
  field: string,
): void => {
  if (
    minimum !== undefined &&
    minimum !== null &&
    maximum !== undefined &&
    maximum !== null &&
    maximum < minimum
  ) {
    throw new Error(`Invalid ${field} range`);
  }
};

const normalizeDescription = (
  description: string | null | undefined,
): string | null | undefined => {
  if (description === undefined || description === null) {
    return description;
  }

  const normalized = description.trim();

  if (normalized.length === 0) {
    throw new Error('Description cannot be blank');
  }

  if (normalized.length < 10 || normalized.length > 5000) {
    throw new Error('Description must be between 10 and 5000 characters');
  }

  return normalized;
};

const normalizeCreateInput = (
  input: CreateProjectQuoteInput,
): CreateProjectQuoteInput => {
  assertPositiveId(input.projectId, 'projectId');

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error('Invalid amount');
  }

  assertFiniteNonNegative(input.labourMin, 'labourMin');
  assertFiniteNonNegative(input.labourMax, 'labourMax');
  assertFiniteNonNegative(input.materialsMin, 'materialsMin');
  assertFiniteNonNegative(input.materialsMax, 'materialsMax');
  assertFiniteNonNegative(input.totalMin, 'totalMin');
  assertFiniteNonNegative(input.totalMax, 'totalMax');

  assertRange(input.labourMin, input.labourMax, 'labour');
  assertRange(input.materialsMin, input.materialsMax, 'materials');
  assertRange(input.totalMin, input.totalMax, 'total');

  if (
    input.durationDays !== undefined &&
    input.durationDays !== null &&
    (!Number.isSafeInteger(input.durationDays) ||
      input.durationDays < 1 ||
      input.durationDays > 3650)
  ) {
    throw new Error('Invalid durationDays');
  }

  return {
    ...input,
    description: normalizeDescription(input.description),
  };
};

const normalizeUpdateInput = (
  input: UpdateProjectQuoteInput,
): UpdateProjectQuoteInput => {
  const entries = Object.entries(input).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error('Project Quote update requires at least one field');
  }

  const allowed = new Set([
    'amount',
    'labourMin',
    'labourMax',
    'materialsMin',
    'materialsMax',
    'totalMin',
    'totalMax',
    'durationDays',
    'description',
  ]);

  const unsupported = entries.find(([key]) => !allowed.has(key));

  if (unsupported) {
    throw new Error(`Unsupported Project Quote update field: ${unsupported[0]}`);
  }

  if (input.amount !== undefined) {
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      throw new Error('Invalid amount');
    }
  }

  assertFiniteNonNegative(input.labourMin, 'labourMin');
  assertFiniteNonNegative(input.labourMax, 'labourMax');
  assertFiniteNonNegative(input.materialsMin, 'materialsMin');
  assertFiniteNonNegative(input.materialsMax, 'materialsMax');
  assertFiniteNonNegative(input.totalMin, 'totalMin');
  assertFiniteNonNegative(input.totalMax, 'totalMax');

  assertRange(input.labourMin, input.labourMax, 'labour');
  assertRange(input.materialsMin, input.materialsMax, 'materials');
  assertRange(input.totalMin, input.totalMax, 'total');

  if (
    input.durationDays !== undefined &&
    input.durationDays !== null &&
    (!Number.isSafeInteger(input.durationDays) ||
      input.durationDays < 1 ||
      input.durationDays > 3650)
  ) {
    throw new Error('Invalid durationDays');
  }

  return {
    ...input,
    description: normalizeDescription(input.description),
  };
};

const mapProjectQuote = (row: any): ProjectQuote => ({
  id: Number(row.id),
  projectId: Number(row.project_id),
  businessId: Number(row.business_id),
  amount: Number(row.amount),
  labourMin:
    row.labour_min === null ? null : Number(row.labour_min),
  labourMax:
    row.labour_max === null ? null : Number(row.labour_max),
  materialsMin:
    row.materials_min === null ? null : Number(row.materials_min),
  materialsMax:
    row.materials_max === null ? null : Number(row.materials_max),
  totalMin:
    row.total_min === null ? null : Number(row.total_min),
  totalMax:
    row.total_max === null ? null : Number(row.total_max),
  durationDays:
    row.duration_days === null ? null : Number(row.duration_days),
  description: row.description,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const assertEligibleBusinessForProject = async (
  client: PoolClient,
  context: AuthContext,
  businessId: BusinessId,
  projectId: number,
): Promise<void> => {
  const result = await client.query(
    `SELECT 1
     FROM ghm.business b
     JOIN ghm.business_membership bm
       ON bm.business_id = b.id
      AND bm.account_id = $1
      AND bm.membership_role = 'owner'
      AND bm.membership_status = 'active'
     JOIN ghm.project p
       ON p.id = $3
     WHERE b.id = $2
       AND b.is_active = true
       AND b.is_verified = true
       AND b.verification_status = 'approved'
       AND p.status = 'open'
       AND p.account_id <> $1
     LIMIT 1`,
    [context.userId, businessId, projectId],
  );

  if (result.rowCount !== 1) {
    throw new Error('Project Quote Business is not eligible');
  }
};


const findReceivedQuotes = async (
  client: PoolClient,
  context: AuthContext,
  projectId: number,
): Promise<readonly ProjectQuote[]> => {
  const result = await client.query(
    `SELECT ${PROJECT_QUOTE_COLUMNS}
     FROM ghm.project_quote pq
     WHERE pq.project_id = $1
       AND EXISTS (
         SELECT 1
         FROM ghm.project p
         WHERE p.id = pq.project_id
           AND p.account_id = $2
       )
     ORDER BY pq.created_at ASC, pq.id ASC`,
    [projectId, context.userId],
  );

  return result.rows.map(mapProjectQuote);
};

const findOwnQuotes = async (
  client: PoolClient,
  context: AuthContext,
  businessId: BusinessId,
): Promise<readonly ProjectQuote[]> => {
  const result = await client.query(
    `SELECT ${PROJECT_QUOTE_COLUMNS}
     FROM ghm.project_quote pq
     WHERE pq.business_id = $1
       AND EXISTS (
         SELECT 1
         FROM ghm.business b
         JOIN ghm.business_membership bm
           ON bm.business_id = b.id
          AND bm.account_id = $2
          AND bm.membership_role = 'owner'
          AND bm.membership_status = 'active'
         WHERE b.id = pq.business_id
       )
     ORDER BY pq.created_at DESC, pq.id DESC`,
    [businessId, context.userId],
  );

  return result.rows.map(mapProjectQuote);
};

export class PostgresProjectQuoteRepository
  implements ProjectQuoteRepository
{
  constructor(private readonly transactionPool?: TransactionPool) {}

  async readReceived(
    context: AuthContext,
    projectId: number,
  ): Promise<readonly ProjectQuote[]> {
    assertPositiveId(projectId, 'projectId');

    return withAuthorizedTransaction(
      context,
      async client => {
        const ownershipResult = await client.query(
          `SELECT 1
           FROM ghm.project
           WHERE id = $1
             AND account_id = $2
           LIMIT 1`,
          [projectId, context.userId],
        );

        if (ownershipResult.rowCount !== 1) {
          throw new Error('Project Quote access denied');
        }

        return findReceivedQuotes(client, context, projectId);
      },
      this.transactionPool,
    );
  }

  async readOwn(
    context: AuthContext,
    businessId: BusinessId,
  ): Promise<readonly ProjectQuote[]> {
    assertPositiveId(businessId, 'businessId');

    return withAuthorizedTransaction(
      context,
      async client => {
        const ownershipResult = await client.query(
          `SELECT 1
           FROM ghm.business_membership
           WHERE business_id = $2
             AND account_id = $1
             AND membership_role = 'owner'
             AND membership_status = 'active'
           LIMIT 1`,
          [context.userId, businessId],
        );

        if (ownershipResult.rowCount !== 1) {
          throw new Error('Project Quote Business ownership denied');
        }

        return findOwnQuotes(client, context, businessId);
      },
      this.transactionPool,
    );
  }

  async create(
    context: AuthContext,
    input: CreateProjectQuoteInput,
  ): Promise<ProjectQuote> {
    const normalized = normalizeCreateInput(input);

    return withAuthorizedTransaction(
      context,
      async client => {
        const businessOwnershipResult = await client.query(
          `SELECT 1
           FROM ghm.business_membership
           WHERE business_id = $2
             AND account_id = $1
             AND membership_role = 'owner'
             AND membership_status = 'active'
           LIMIT 1`,
          [context.userId, input.businessId],
        );

        if (businessOwnershipResult.rowCount !== 1) {
          throw new Error('Project Quote Business ownership denied');
        }

        await assertEligibleBusinessForProject(
          client,
          context,
          input.businessId,
          normalized.projectId,
        );

        const result = await client.query(
          `INSERT INTO ghm.project_quote (
             project_id,
             business_id,
             amount,
             labour_min,
             labour_max,
             materials_min,
             materials_max,
             total_min,
             total_max,
             duration_days,
             description
           )
           VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
           )
           RETURNING ${PROJECT_QUOTE_COLUMNS}`,
          [
            normalized.projectId,
            input.businessId,
            normalized.amount,
            normalized.labourMin ?? null,
            normalized.labourMax ?? null,
            normalized.materialsMin ?? null,
            normalized.materialsMax ?? null,
            normalized.totalMin ?? null,
            normalized.totalMax ?? null,
            normalized.durationDays ?? null,
            normalized.description ?? null,
          ],
        );

        if (result.rowCount !== 1) {
          throw new Error('Project Quote creation failed');
        }

        return mapProjectQuote(result.rows[0]);
      },
      this.transactionPool,
    );
  }

  async update(
    context: AuthContext,
    quoteId: ProjectQuoteId,
    input: UpdateProjectQuoteInput,
  ): Promise<ProjectQuote> {
    assertPositiveId(quoteId, 'quoteId');

    const normalized = normalizeUpdateInput(input);

    return withAuthorizedTransaction(
      context,
      async client => {
        const fields: string[] = [];
        const values: unknown[] = [quoteId, context.userId];
        let parameter = 3;

        const updateFields: readonly [
          keyof UpdateProjectQuoteInput,
          string,
        ][] = [
          ['amount', 'amount'],
          ['labourMin', 'labour_min'],
          ['labourMax', 'labour_max'],
          ['materialsMin', 'materials_min'],
          ['materialsMax', 'materials_max'],
          ['totalMin', 'total_min'],
          ['totalMax', 'total_max'],
          ['durationDays', 'duration_days'],
          ['description', 'description'],
        ];

        for (const [key, column] of updateFields) {
          if (normalized[key] !== undefined) {
            fields.push(`${column} = $${parameter}`);
            values.push(normalized[key] ?? null);
            parameter += 1;
          }
        }

        fields.push('updated_at = now()');

        const result = await client.query(
          `UPDATE ghm.project_quote pq
           SET ${fields.join(', ')}
           FROM ghm.project p,
                ghm.business b
           WHERE pq.id = $1
             AND pq.business_id = b.id
             AND p.id = pq.project_id
             AND p.status = 'open'
             AND pq.status = 'submitted'
             AND b.is_active = true
             AND b.is_verified = true
             AND b.verification_status = 'approved'
             AND EXISTS (
               SELECT 1
               FROM ghm.business_membership bm
               WHERE bm.business_id = pq.business_id
                 AND bm.account_id = $2
                 AND bm.membership_role = 'owner'
                 AND bm.membership_status = 'active'
             )
           RETURNING pq.id, pq.project_id, pq.business_id, pq.amount, pq.labour_min, pq.labour_max, pq.materials_min, pq.materials_max, pq.total_min, pq.total_max, pq.duration_days, pq.description, pq.status, pq.created_at, pq.updated_at`,
          values,
        );

        if (result.rowCount !== 1) {
          throw new Error(
            'Project Quote not found, not owned, not editable, or Project is not open',
          );
        }

        return mapProjectQuote(result.rows[0]);
      },
      this.transactionPool,
    );
  }

  async decide(
    context: AuthContext,
    quoteId: ProjectQuoteId,
    decision: ProjectQuoteDecision,
  ): Promise<ProjectQuote> {
    assertPositiveId(quoteId, 'quoteId');

    return withAuthorizedTransaction(
      context,
      async client => {
        const quoteProjectResult = await client.query(
          `SELECT project_id
           FROM ghm.project_quote
           WHERE id = $1`,
          [quoteId],
        );

        if (quoteProjectResult.rowCount !== 1) {
          throw new Error('Submitted Project Quote was not found');
        }

        const projectId = Number(quoteProjectResult.rows[0].project_id);

        const projectResult = await client.query(
          `SELECT id, account_id, status
           FROM ghm.project
           WHERE id = $1
           FOR UPDATE`,
          [projectId],
        );

        if (projectResult.rowCount !== 1) {
          throw new Error('Project was not found');
        }

        const project = projectResult.rows[0];

        if (Number(project.account_id) !== context.userId) {
          throw new Error('Project ownership required');
        }

        if (project.status !== 'open') {
          throw new Error('Only open Projects may receive a quote decision');
        }

        const quoteResult = await client.query(
          `SELECT ${PROJECT_QUOTE_COLUMNS}
           FROM ghm.project_quote
           WHERE id = $1
             AND status = 'submitted'
             FOR UPDATE`,
          [quoteId],
        );

        if (quoteResult.rowCount !== 1) {
          throw new Error('Submitted Project Quote was not found');
        }

        const selectedQuote = mapProjectQuote(quoteResult.rows[0]);


        if (decision === 'rejected') {
          const result = await client.query(
            `UPDATE ghm.project_quote
             SET
               status = 'rejected',
               updated_at = now()
             WHERE id = $1
               AND status = 'submitted'
             RETURNING ${PROJECT_QUOTE_COLUMNS}`,
            [quoteId],
          );

          if (result.rowCount !== 1) {
            throw new Error('Project Quote rejection failed');
          }

          return mapProjectQuote(result.rows[0]);
        }

        await client.query(
          `UPDATE ghm.project_quote
           SET
             status = 'rejected',
             updated_at = now()
           WHERE project_id = $1
             AND status = 'submitted'
             AND id <> $2`,
          [selectedQuote.projectId, quoteId],
        );

        const acceptedResult = await client.query(
          `UPDATE ghm.project_quote
           SET
             status = 'accepted',
             updated_at = now()
           WHERE id = $1
             AND status = 'submitted'
           RETURNING ${PROJECT_QUOTE_COLUMNS}`,
          [quoteId],
        );

        if (acceptedResult.rowCount !== 1) {
          throw new Error('Project Quote acceptance failed');
        }

        await transitionOpenProjectToInProgress(
          client,
          context,
          selectedQuote.projectId,
        );

        return mapProjectQuote(acceptedResult.rows[0]);
      },
      this.transactionPool,
    );
  }
}



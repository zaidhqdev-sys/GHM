import { pool } from '../../db/pool';
import type { TransactionPool } from '../../db/transaction';
import type {
  PublicProject,
  PublicProjectRepository,
  PublicProjectSearchInput,
  PublicProjectPage,
} from './public-contracts';

const PUBLIC_PROJECT_COLUMNS = `
  id,
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

interface PublicProjectRow {
  id: string | number;
  title: string;
  description: string;
  category: string;
  province: string;
  city: string;
  budget_min: string | number | null;
  budget_max: string | number | null;
  urgency: PublicProject['urgency'];
  status: 'open';
  created_at: Date;
  updated_at: Date;
}

const mapPublicProject = (row: PublicProjectRow): PublicProject => ({
  id: Number(row.id),
  title: row.title,
  description: row.description,
  category: row.category,
  province: row.province,
  city: row.city,
  budgetMin: row.budget_min === null ? null : Number(row.budget_min),
  budgetMax: row.budget_max === null ? null : Number(row.budget_max),
  urgency: row.urgency,
  status: 'open',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PostgresPublicProjectRepository implements PublicProjectRepository {
  constructor(private readonly transactionPool: TransactionPool = pool) {}


  async listPublicProjects(input: PublicProjectSearchInput): Promise<PublicProjectPage> {
    const client = await this.transactionPool.connect();
    try {
      const filters = [
        input.category ?? null,
        input.province ?? null,
        input.urgency ?? null,
        input.search?.trim() || null,
      ];
      const where = `
        status = 'open'
        AND ($1::text IS NULL OR lower(category) = lower($1))
        AND ($2::text IS NULL OR lower(province) = lower($2))
        AND ($3::text IS NULL OR urgency = $3)
        AND ($4::text IS NULL OR
          strpos(lower(title), lower($4)) > 0 OR
          strpos(lower(description), lower($4)) > 0 OR
          strpos(lower(city), lower($4)) > 0 OR
          strpos(lower(category), lower($4)) > 0)
      `;
      const count = await client.query(
        `SELECT count(*)::int AS total FROM ghm.project_public WHERE ${where}`,
        filters,
      );
      const result = await client.query(
        `SELECT ${PUBLIC_PROJECT_COLUMNS}
         FROM ghm.project_public
         WHERE ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT $5 OFFSET $6`,
        [...filters, input.limit, input.offset],
      );
      return {
        projects: result.rows.map(mapPublicProject),
        total: Number(count.rows[0]?.total ?? 0),
        limit: input.limit,
        offset: input.offset,
      };
    } finally {
      client.release();
    }
  }

  async getPublicProject(projectId: number): Promise<PublicProject | null> {
    const client = await this.transactionPool.connect();

    try {
      const result = await client.query(
        `SELECT ${PUBLIC_PROJECT_COLUMNS}
         FROM ghm.project_public
         WHERE id = $1`,
        [projectId],
      );

      return result.rowCount === 1
        ? mapPublicProject(result.rows[0])
        : null;
    } finally {
      client.release();
    }
  }
}

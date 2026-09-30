import { pool } from '../../db/pool';
import type { TransactionPool } from '../../db/transaction';
import type {
  PublicProject,
  PublicProjectRepository,
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

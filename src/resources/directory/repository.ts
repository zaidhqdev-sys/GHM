import { pool } from '../../db/pool.js';
import type { TransactionPool } from '../../db/transaction.js';
import type { DirectoryQuery, DirectoryRepository, DirectoryResult, PublicDirectoryBusiness } from './contracts.js';

const DIRECTORY_COLUMNS = `
  b.id,
  b.name,
  b.slug,
  b.description,
  b.phone,
  b.email,
  b.rating,
  b.review_count,
  b.jobs_completed,
  b.verification_status,
  b.is_verified,
  b.created_at,
  b.updated_at
`;

const PUBLIC_VISIBILITY = `
  b.is_active = true
  AND b.is_verified = true
  AND b.verification_status = 'approved'
`;

interface DirectoryRow {
  id: string | number;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  rating: string | number;
  review_count: string | number;
  jobs_completed: string | number;
  verification_status: PublicDirectoryBusiness['verificationStatus'];
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

const mapDirectoryBusiness = (row: DirectoryRow): PublicDirectoryBusiness => ({
  id: Number(row.id),
  name: row.name,
  slug: row.slug,
  description: row.description ?? null,
  phone: row.phone ?? null,
  email: row.email ?? null,
  rating: Number(row.rating),
  reviewCount: Number(row.review_count),
  jobsCompleted: Number(row.jobs_completed),
  verificationStatus: row.verification_status,
  isVerified: row.is_verified === true,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const textPredicate = (query: DirectoryQuery): { sql: string; values: unknown[] } => {
  if (!query.q) return { sql: '', values: [] };
  const escaped = query.q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return {
    sql: `AND (
      b.name ILIKE '%' || $1 || '%' ESCAPE '\\\\'
      OR b.slug ILIKE '%' || $1 || '%' ESCAPE '\\\\'
      OR COALESCE(b.description, '') ILIKE '%' || $1 || '%' ESCAPE '\\\\'
    )`,
    values: [escaped],
  };
};

const categoryPredicate = (query: DirectoryQuery, parameterIndex: number): { sql: string; values: unknown[] } => {
  if (!query.category) return { sql: '', values: [] };
  return {
    sql: `AND EXISTS (
      SELECT 1
      FROM ghm.business_category_assignment bca
      JOIN ghm.business_category bc ON bc.id = bca.category_id
      WHERE bca.business_id = b.id
        AND bc.is_active = true
        AND (bc.id = $${parameterIndex} OR bc.slug = $${parameterIndex})
    )`,
    values: [query.category],
  };
};

export class PostgresDirectoryRepository implements DirectoryRepository {
  constructor(private readonly transactionPool: TransactionPool = pool) {}

  async search(query: DirectoryQuery): Promise<DirectoryResult> {
    const client = await this.transactionPool.connect();
    try {
      const text = textPredicate(query);
      const category = categoryPredicate(query, text.values.length + 1);
      const values = [...text.values, ...category.values];

      const where = `WHERE ${PUBLIC_VISIBILITY}
        ${text.sql}
        ${category.sql}`;

      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM ghm.business b
         ${where}`,
        values,
      );

      const total = Number(countResult.rows[0]?.count ?? 0);
      const offset = (query.page - 1) * query.pageSize;
      const itemValues = [...values, query.pageSize, offset];
      const limitIndex = values.length + 1;
      const offsetIndex = values.length + 2;

      const result = await client.query<DirectoryRow>(
        `SELECT ${DIRECTORY_COLUMNS}
         FROM ghm.business b
         ${where}
         ORDER BY b.rating DESC, b.review_count DESC, b.id ASC
         LIMIT $${limitIndex}
         OFFSET $${offsetIndex}`,
        itemValues,
      );

      return {
        items: result.rows.map(mapDirectoryBusiness),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    } finally {
      client.release();
    }
  }
}

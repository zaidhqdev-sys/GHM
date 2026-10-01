import { pool } from '../../db/pool';
import type { TransactionPool } from '../../db/transaction';
import type { PublicBusiness, PublicBusinessRepository } from './public-contracts';

const PUBLIC_BUSINESS_COLUMNS = `
  id,
  name,
  slug,
  description,
  phone,
  email,
  rating,
  review_count,
  jobs_completed,
  verification_status,
  is_verified,
  created_at,
  updated_at
`;

interface PublicBusinessRow {
  id: string | number;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  rating: string | number;
  review_count: string | number;
  jobs_completed: string | number;
  verification_status: PublicBusiness['verificationStatus'];
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

const mapPublicBusiness = (row: PublicBusinessRow): PublicBusiness => ({
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

const PUBLIC_VISIBILITY = `
  b.is_active = true
  AND b.is_verified = true
  AND b.verification_status = 'approved'
`;

export class PostgresPublicBusinessRepository implements PublicBusinessRepository {
  constructor(private readonly transactionPool: TransactionPool = pool) {}

  async getPublicBusiness(businessId: number): Promise<PublicBusiness | null> {
    const client = await this.transactionPool.connect();
    try {
      const result = await client.query(
        `SELECT ${PUBLIC_BUSINESS_COLUMNS}
         FROM ghm.business b
         WHERE b.id = $1
           AND ${PUBLIC_VISIBILITY}`,
        [businessId],
      );
      return result.rowCount === 1 ? mapPublicBusiness(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async getPublicBusinessBySlug(slug: string): Promise<PublicBusiness | null> {
    const client = await this.transactionPool.connect();
    try {
      const result = await client.query(
        `SELECT ${PUBLIC_BUSINESS_COLUMNS}
         FROM ghm.business b
         WHERE b.slug = $1
           AND ${PUBLIC_VISIBILITY}`,
        [slug],
      );
      return result.rowCount === 1 ? mapPublicBusiness(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }
}

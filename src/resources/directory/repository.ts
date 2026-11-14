import { pool } from '../../db/pool.js';
import type { TransactionPool } from '../../db/transaction.js';
import type { DirectoryQuery, DirectoryRepository, DirectoryResult, PublicDirectoryBusiness } from './contracts.js';

const DIRECTORY_COLUMNS = `
  b.id, b.name, b.slug, b.description, b.phone, b.email,
  b.province, b.city, b.physical_address, b.latitude, b.longitude,
  b.whatsapp, b.website, b.is_supplier, b.logo_storage_object_id, b.rating, b.review_count, b.jobs_completed,
  b.verification_status, b.is_verified, b.created_at, b.updated_at
`;
const PUBLIC_VISIBILITY = `b.is_active = true AND b.is_verified = true AND b.verification_status = 'approved'`;
const DISTANCE_SQL = `(6371 * acos(LEAST(1, GREATEST(-1,
  sin(radians($LAT$)) * sin(radians(b.latitude))
  + cos(radians($LAT$)) * cos(radians(b.latitude)) * cos(radians(b.longitude) - radians($LON$))
))))`;

interface DirectoryRow {
  id: string | number; name: string; slug: string; description: string | null;
  phone: string | null; email: string | null; province: string | null; city: string | null;
  physical_address: string | null; latitude: string | number | null; longitude: string | number | null;
  whatsapp: string | null; website: string | null; logo_storage_object_id: string | number | null; rating: string | number;
  review_count: string | number; jobs_completed: string | number;
  verification_status: PublicDirectoryBusiness['verificationStatus']; is_verified: boolean;
  is_supplier: boolean; created_at: Date; updated_at: Date; distance_km?: string | number | null; category?: string | null;
}

const distanceSql = (latIndex: number, lonIndex: number) =>
  DISTANCE_SQL.replaceAll('$LAT$', String(latIndex)).replaceAll('$LON$', String(lonIndex));

const mapDirectoryBusiness = (row: DirectoryRow): PublicDirectoryBusiness => ({
  id: Number(row.id), name: row.name, slug: row.slug, description: row.description ?? null,
  phone: row.phone ?? null, email: row.email ?? null, province: row.province ?? null,
  city: row.city ?? null, physicalAddress: row.physical_address ?? null,
  latitude: row.latitude === null ? null : Number(row.latitude),
  longitude: row.longitude === null ? null : Number(row.longitude),
  whatsapp: row.whatsapp ?? null, website: row.website ?? null, isSupplier: row.is_supplier === true, logoUrl: row.logo_storage_object_id === null || row.logo_storage_object_id === undefined ? null : `/api/v1/public/businesses/${Number(row.id)}/logo`,
  rating: Number(row.rating), reviewCount: Number(row.review_count),
  jobsCompleted: Number(row.jobs_completed), category: row.category ?? null, verificationStatus: row.verification_status,
  isVerified: row.is_verified === true, createdAt: row.created_at, updatedAt: row.updated_at,
  ...(row.distance_km === null || row.distance_km === undefined ? {} : { distanceKm: Number(row.distance_km) }),
});

export class PostgresDirectoryRepository implements DirectoryRepository {
  constructor(private readonly transactionPool: TransactionPool = pool) {}

  async search(query: DirectoryQuery): Promise<DirectoryResult> {
    const client = await this.transactionPool.connect();
    try {
      const values: unknown[] = [];
      const clauses = [PUBLIC_VISIBILITY];
      const add = (value: unknown): number => { values.push(value); return values.length; };

      if (query.q) {
        const index = add(query.q);
        clauses.push(`(strpos(lower(b.name), lower($${index})) > 0
          OR strpos(lower(b.slug), lower($${index})) > 0
          OR strpos(lower(COALESCE(b.description, '')), lower($${index})) > 0
          OR strpos(lower(COALESCE(b.city, '')), lower($${index})) > 0)`);
      }
      if (query.category) {
        const index = add(query.category);
        clauses.push(`EXISTS (
          SELECT 1 FROM ghm.business_category_assignment bca
          JOIN ghm.business_category bc ON bc.id = bca.category_id
          WHERE bca.business_id = b.id AND bc.is_active = true
            AND (bc.id::text = $${index} OR bc.slug = $${index})
        )`);
      }
      if (query.businessType) {
        const supplier = query.businessType === 'suppliers';
        const index = add(supplier);
        clauses.push(`b.is_supplier = ${index}`);
      }

      if (query.province) {
        const index = add(query.province);
        clauses.push(`lower(b.province) = lower($${index})`);
      }
      if (query.city) {
        const index = add(query.city);
        clauses.push(`strpos(lower(COALESCE(b.city, '')), lower($${index})) > 0`);
      }

      let distanceExpression: string | null = null;
      let latIndex: number | null = null;
      let lonIndex: number | null = null;
      if (query.latitude !== undefined && query.longitude !== undefined) {
        latIndex = add(query.latitude);
        lonIndex = add(query.longitude);
        distanceExpression = distanceSql(latIndex, lonIndex);
        clauses.push('b.latitude IS NOT NULL AND b.longitude IS NOT NULL');
        if (query.radiusKm !== undefined) {
          const radiusIndex = add(query.radiusKm);
          clauses.push(`${distanceExpression} <= $${radiusIndex}`);
        }
      }

      const where = `WHERE ${clauses.join(' AND ')}`;
      const countResult = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ghm.business b ${where}`, values,
      );
      const total = Number(countResult.rows[0]?.count ?? 0);

      const limitIndex = add(query.pageSize);
      const offsetIndex = add((query.page - 1) * query.pageSize);
      let orderBy = 'b.rating DESC, b.review_count DESC, b.id ASC';
      if (query.sort === 'newest') orderBy = 'b.created_at DESC, b.id ASC';
      if (query.sort === 'reviews') orderBy = 'b.review_count DESC, b.rating DESC, b.id ASC';
      if (query.sort === 'distance' && distanceExpression) orderBy = `${distanceExpression} ASC, b.id ASC`;

      const selectDistance = distanceExpression ? `, ${distanceExpression} AS distance_km` : '';
      const categoryProjection = `, (SELECT bc.slug FROM ghm.business_category_assignment bca JOIN ghm.business_category bc ON bc.id = bca.category_id WHERE bca.business_id = b.id AND bca.is_primary = true AND bc.is_active = true LIMIT 1) AS category`;
      const result = await client.query<DirectoryRow>(
        `SELECT ${DIRECTORY_COLUMNS}${selectDistance}${categoryProjection}
         FROM ghm.business b ${where}
         ORDER BY ${orderBy}
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        values,
      );
      return { items: result.rows.map(mapDirectoryBusiness), page: query.page, pageSize: query.pageSize, total };
    } finally {
      client.release();
    }
  }
}

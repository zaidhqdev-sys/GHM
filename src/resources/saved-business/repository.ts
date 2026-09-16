import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  CreateSavedBusinessInput,
  SavedBusiness,
  SavedBusinessId,
  SavedBusinessPublicBusiness,
  SavedBusinessRepository,
} from './contracts';

const SAVED_BUSINESS_COLUMNS = `
  sb.id,
  sb.account_id,
  sb.business_id,
  sb.created_at,
  b.id AS business_id_projection,
  b.name,
  b.slug,
  b.verification_status,
  b.is_verified,
  b.is_active,
  b.created_at AS business_created_at,
  b.updated_at AS business_updated_at,
  b.rating,
  b.review_count
`;

const mapSavedBusiness = (row: any): SavedBusiness => ({
  id: Number(row.id),
  accountId: Number(row.account_id),
  businessId: Number(row.business_id),
  createdAt: row.created_at,
  business: {
    id: Number(row.business_id_projection),
    name: row.name,
    slug: row.slug,
    verificationStatus: row.verification_status,
    isVerified: row.is_verified,
    isActive: row.is_active,
    createdAt: row.business_created_at,
    updatedAt: row.business_updated_at,
    rating: row.rating === null ? null : Number(row.rating),
    reviewCount: Number(row.review_count),
  },
});

const assertPositiveId = (id: number, field: string): void => {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid ${field}`);
};

const getSavedBusinessInTransaction = async (
  client: PoolClient,
  context: AuthContext,
  savedBusinessId: SavedBusinessId,
): Promise<SavedBusiness | null> => {
  const result = await client.query(
    `SELECT ${SAVED_BUSINESS_COLUMNS}
       FROM ghm.saved_business sb
       JOIN ghm.business b ON b.id = sb.business_id
      WHERE sb.id = $1 AND sb.account_id = $2`,
    [savedBusinessId, context.userId],
  );
  return result.rowCount === 1 ? mapSavedBusiness(result.rows[0]) : null;
};

export class PostgresSavedBusinessRepository implements SavedBusinessRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async createSavedBusiness(context: AuthContext, input: CreateSavedBusinessInput): Promise<SavedBusiness> {
    return withAuthorizedTransaction(context, async client => {
      const eligibleBusiness = await client.query(
        `SELECT id
           FROM ghm.business
          WHERE id = $1
            AND is_active = true
            AND is_verified = true
            AND verification_status = 'approved'
          LIMIT 1`,
        [input.businessId],
      );
      if (eligibleBusiness.rowCount !== 1) throw new Error('Business is not eligible to be saved');

      let inserted;
      try {
        inserted = await client.query(
          `INSERT INTO ghm.saved_business (account_id, business_id)
           VALUES ($1, $2)
           RETURNING id`,
          [context.userId, input.businessId],
        );
      } catch (error: any) {
        if (error?.code === '23505') throw new Error('Business is already saved');
        throw error;
      }

      const savedBusiness = await getSavedBusinessInTransaction(client, context, Number(inserted.rows[0].id));
      if (!savedBusiness) throw new Error('Saved Business could not be loaded after creation');
      return savedBusiness;
    }, this.transactionPool);
  }

  async getSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<SavedBusiness | null> {
    assertPositiveId(savedBusinessId, 'savedBusinessId');
    return withAuthorizedTransaction(
      context,
      client => getSavedBusinessInTransaction(client, context, savedBusinessId),
      this.transactionPool,
    );
  }

  async listSavedBusinesses(context: AuthContext): Promise<SavedBusiness[]> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ${SAVED_BUSINESS_COLUMNS}
           FROM ghm.saved_business sb
           JOIN ghm.business b ON b.id = sb.business_id
          WHERE sb.account_id = $1
          ORDER BY sb.created_at DESC, sb.id DESC`,
        [context.userId],
      );
      return result.rows.map(mapSavedBusiness);
    }, this.transactionPool);
  }

  async deleteSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<SavedBusiness> {
    assertPositiveId(savedBusinessId, 'savedBusinessId');
    return withAuthorizedTransaction(context, async client => {
      const existing = await getSavedBusinessInTransaction(client, context, savedBusinessId);
      if (!existing) throw new Error('Saved Business not found');

      const result = await client.query(
        `DELETE FROM ghm.saved_business
          WHERE id = $1 AND account_id = $2
          RETURNING id`,
        [savedBusinessId, context.userId],
      );
      if (result.rowCount !== 1) throw new Error('Saved Business not found');
      return existing;
    }, this.transactionPool);
  }
}

import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { CreateSavedBusinessInput, SavedBusiness, SavedBusinessId, SavedBusinessRepository } from './contracts';

const COLUMNS = 'id, account_id, business_id, created_at';

const mapSavedBusiness = (row: any): SavedBusiness => ({
  id: Number(row.id),
  accountId: Number(row.account_id),
  businessId: Number(row.business_id),
  createdAt: row.created_at,
});

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

export class PostgresSavedBusinessRepository implements SavedBusinessRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async createSavedBusiness(context: AuthContext, input: CreateSavedBusinessInput): Promise<SavedBusiness> {
    const businessId = requirePositiveId(input.businessId, 'businessId');
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT * FROM ghm.create_saved_business($1, $2)`,
        [context.userId, businessId],
      );
      return mapSavedBusiness(result.rows[0]);
    }, this.transactionPool);
  }

  async getSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<SavedBusiness | null> {
    const id = requirePositiveId(savedBusinessId, 'savedBusinessId');
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM ghm.saved_business
         WHERE id = $1 AND account_id = $2`,
        [id, context.userId],
      );
      return result.rowCount === 1 ? mapSavedBusiness(result.rows[0]) : null;
    }, this.transactionPool);
  }

  async listSavedBusinesses(context: AuthContext): Promise<SavedBusiness[]> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM ghm.saved_business
         WHERE account_id = $1
         ORDER BY created_at DESC, id DESC`,
        [context.userId],
      );
      return result.rows.map(mapSavedBusiness);
    }, this.transactionPool);
  }

  async deleteSavedBusiness(context: AuthContext, savedBusinessId: SavedBusinessId): Promise<void> {
    const id = requirePositiveId(savedBusinessId, 'savedBusinessId');
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ghm.delete_saved_business($1, $2) AS deleted`,
        [context.userId, id],
      );
      if (result.rows[0]?.deleted !== true) throw new Error('Saved Business not found');
    }, this.transactionPool);
  }
}

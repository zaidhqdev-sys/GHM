import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  BusinessHours,
  BusinessHoursRepository,
  ReplaceBusinessHoursInput,
} from './contracts';

const COLUMNS = `id, business_id, day_of_week, is_closed, open_time, close_time, created_by, created_at, updated_at`;

const mapBusinessHours = (row: any): BusinessHours => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  dayOfWeek: Number(row.day_of_week),
  isClosed: Boolean(row.is_closed),
  openTime: row.open_time,
  closeTime: row.close_time,
  createdBy: row.created_by === null ? null : Number(row.created_by),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const assertBusinessReadAuthority = async (client: any, context: AuthContext, businessId: number): Promise<void> => {
  const result = await client.query(
    `SELECT 1 FROM ghm.business b
     WHERE b.id = $1 AND b.is_active = true
       AND EXISTS (
         SELECT 1 FROM ghm.business_membership bm
         WHERE bm.business_id = b.id
           AND bm.account_id = $2
           AND bm.membership_status = 'active'
       )`,
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Business access required');
};

const assertPublicBusiness = async (client: any, businessId: number): Promise<void> => {
  const result = await client.query(
    `SELECT 1 FROM ghm.business
     WHERE id = $1 AND is_active = true AND verification_status = 'approved'`,
    [businessId],
  );
  if (result.rowCount !== 1) throw new Error('Public Business not found');
};

export class PostgresBusinessHoursRepository implements BusinessHoursRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async getBusinessHours(context: AuthContext, businessId: number): Promise<BusinessHours[]> {
    return withAuthorizedTransaction(context, async client => {
      await assertBusinessReadAuthority(client, context, businessId);
      const result = await client.query(
        `SELECT ${COLUMNS} FROM ghm.business_hours WHERE business_id = $1 ORDER BY day_of_week ASC, id ASC`,
        [businessId],
      );
      return result.rows.map(mapBusinessHours);
    }, this.transactionPool);
  }

  async getPublicBusinessHours(context: AuthContext, businessId: number): Promise<BusinessHours[]> {
    return withAuthorizedTransaction(context, async client => {
      await assertPublicBusiness(client, businessId);
      const result = await client.query(
        `SELECT ${COLUMNS} FROM ghm.business_hours WHERE business_id = $1 ORDER BY day_of_week ASC, id ASC`,
        [businessId],
      );
      return result.rows.map(mapBusinessHours);
    }, this.transactionPool);
  }

  async replaceBusinessHours(context: AuthContext, input: ReplaceBusinessHoursInput): Promise<BusinessHours[]> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ${COLUMNS}
         FROM ghm.replace_business_hours($1, $2, $3::jsonb)
         ORDER BY day_of_week ASC, id ASC`,
        [input.businessId, context.userId, JSON.stringify(input.hours)],
      );
      return result.rows.map(mapBusinessHours);
    }, this.transactionPool);
  }
}

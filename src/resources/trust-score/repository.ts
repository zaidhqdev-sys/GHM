import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import { withTransaction, type TransactionPool } from '../../db/transaction';
import type { TrustLevel, TrustScore, TrustScoreRepository, BusinessId } from './contracts';

const COLUMNS = `ts.id, ts.business_id, ts.profile_complete, ts.phone_verified, ts.email_verified,
  ts.id_verified, ts.cipc_verified, ts.vat_verified, ts.insurance_verified, ts.reviews_score,
  ts.completed_projects, ts.total_score, ts.trust_level, ts.last_updated, ts.created_at, ts.updated_at`;

const PUBLIC_VISIBLE = `
  b.is_active = true
  AND b.is_verified = true
  AND b.verification_status = 'approved'
`;

const mapTrustScore = (row: any): TrustScore => ({
  id: Number(row.id),
  businessId: Number(row.business_id),
  profileComplete: Number(row.profile_complete),
  phoneVerified: Number(row.phone_verified),
  emailVerified: Number(row.email_verified),
  idVerified: Number(row.id_verified),
  cipcVerified: Number(row.cipc_verified),
  vatVerified: Number(row.vat_verified),
  insuranceVerified: Number(row.insurance_verified),
  reviewsScore: Number(row.reviews_score),
  completedProjects: Number(row.completed_projects),
  totalScore: Number(row.total_score),
  trustLevel: row.trust_level,
  lastUpdated: row.last_updated,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const requireTrustLevel = (value: unknown): TrustLevel => {
  if (value !== 'bronze' && value !== 'silver' && value !== 'gold' && value !== 'platinum') {
    throw new Error('trustLevel must be bronze, silver, gold, or platinum');
  }
  return value;
};

export class PostgresTrustScoreRepository implements TrustScoreRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async getPublicTrustScore(businessId: BusinessId): Promise<TrustScore | null> {
    const id = requirePositiveId(businessId, 'businessId');
    return withTransaction(async (client) => {
      const result = await client.query(
        `SELECT ${COLUMNS}
         FROM ghm.trust_score ts
         JOIN ghm.business b ON b.id = ts.business_id
         WHERE ts.business_id = $1
           AND ${PUBLIC_VISIBLE}`,
        [id],
      );
      return result.rowCount === 1 ? mapTrustScore(result.rows[0]) : null;
    }, this.transactionPool);
  }

  async getTrustScore(context: AuthContext, businessId: BusinessId): Promise<TrustScore | null> {
    const id = requirePositiveId(businessId, 'businessId');
    return withAuthorizedTransaction(context, async (client) => {
      const result = await client.query(
        `SELECT ${COLUMNS}
         FROM ghm.trust_score ts
         JOIN ghm.business b ON b.id = ts.business_id
         WHERE ts.business_id = $1
           AND (
             (${PUBLIC_VISIBLE})
             OR EXISTS (
               SELECT 1
               FROM ghm.business_membership bm
               WHERE bm.business_id = ts.business_id
                 AND bm.account_id = $2
                 AND bm.membership_status = 'active'
                 AND bm.membership_role IN ('owner', 'administrator')
             )
           )`,
        [id, context.userId],
      );
      return result.rowCount === 1 ? mapTrustScore(result.rows[0]) : null;
    }, this.transactionPool);
  }

  async listPublicByTrustLevel(trustLevel: TrustLevel): Promise<TrustScore[]> {
    const level = requireTrustLevel(trustLevel);
    return withTransaction(async (client) => {
      const result = await client.query(
        `SELECT ${COLUMNS}
         FROM ghm.trust_score ts
         JOIN ghm.business b ON b.id = ts.business_id
         WHERE ts.trust_level = $1
           AND ${PUBLIC_VISIBLE}
         ORDER BY ts.total_score DESC, ts.id DESC`,
        [level],
      );
      return result.rows.map(mapTrustScore);
    }, this.transactionPool);
  }

  async listByTrustLevel(context: AuthContext, trustLevel: TrustLevel): Promise<TrustScore[]> {
    const level = requireTrustLevel(trustLevel);
    return withAuthorizedTransaction(context, async (client) => {
      const result = await client.query(
        `SELECT ${COLUMNS}
         FROM ghm.trust_score ts
         JOIN ghm.business b ON b.id = ts.business_id
         WHERE ts.trust_level = $1
           AND (
             (${PUBLIC_VISIBLE})
             OR EXISTS (
               SELECT 1
               FROM ghm.business_membership bm
               WHERE bm.business_id = ts.business_id
                 AND bm.account_id = $2
                 AND bm.membership_status = 'active'
                 AND bm.membership_role IN ('owner', 'administrator')
             )
           )
         ORDER BY ts.total_score DESC, ts.id DESC`,
        [level, context.userId],
      );
      return result.rows.map(mapTrustScore);
    }, this.transactionPool);
  }

  async calculateTrustScore(context: AuthContext, businessId: BusinessId): Promise<TrustScore> {
    const id = requirePositiveId(businessId, 'businessId');
    return withAuthorizedTransaction(context, async (client) => {
      const result = await client.query(
        `SELECT * FROM ghm.calculate_business_trust_score($1, $2)`,
        [context.userId, id],
      );
      return mapTrustScore(result.rows[0]);
    }, this.transactionPool);
  }
}

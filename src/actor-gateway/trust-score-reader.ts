import type { Pool } from 'pg';
import { createActorGatewayAssertion } from './request-assertion';
import type { TrustLevel, TrustScore } from '../resources/trust-score/contracts';

type ConnectablePool = Pick<Pool, 'connect'>;

export interface TrustScoreGatewayReader {
  get(actor: number, businessId: number): Promise<TrustScore | null>;
  list(actor: number, trustLevel: TrustLevel): Promise<TrustScore[]>;
  calculate(actor: number, businessId: number): Promise<TrustScore>;
}

const mapRow = (row: any): TrustScore => ({
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

export class PostgresTrustScoreGatewayReader implements TrustScoreGatewayReader {
  private readonly key: Buffer;

  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  async get(actor: number, businessId: number): Promise<TrustScore | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const context = { businessId };
      const assertion = createActorGatewayAssertion(this.key, actor, 'trust.score.read', context);
      const result = await client.query(
        'SELECT * FROM ghm.gateway_get_trust_score($1,$2,$3,$4,$5,$6)',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, businessId],
      );
      await client.query('COMMIT');
      return result.rowCount === 1 ? mapRow(result.rows[0]) : null;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async list(actor: number, trustLevel: TrustLevel): Promise<TrustScore[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const context = { trustLevel };
      const assertion = createActorGatewayAssertion(this.key, actor, 'trust.score.read', context);
      const result = await client.query(
        'SELECT * FROM ghm.gateway_list_trust_scores($1,$2,$3,$4,$5,$6) ORDER BY total_score DESC,id DESC',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, trustLevel],
      );
      await client.query('COMMIT');
      return result.rows.map(mapRow);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async calculate(actor: number, businessId: number): Promise<TrustScore> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const context = { businessId };
      const assertion = createActorGatewayAssertion(this.key, actor, 'trust.score.calculate', context);
      const result = await client.query(
        'SELECT * FROM ghm.gateway_calculate_business_trust_score($1,$2,$3,$4,$5,$6)',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, businessId],
      );
      if (result.rowCount !== 1) throw new Error('Trust Score calculation returned no row');
      await client.query('COMMIT');
      return mapRow(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

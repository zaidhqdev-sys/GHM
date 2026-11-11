import type { Pool, PoolClient } from 'pg';
import { createActorGatewayAssertion } from './request-assertion';
import type { BusinessHours } from '../resources/business-hours/contracts';

type ConnectablePool = Pick<Pool, 'connect'>;

export interface BusinessHoursGatewayReader {
  replace(actor: number, businessId: number, hours: Array<{
    day_of_week: number;
    is_closed: boolean;
    open_time: string | null;
    close_time: string | null;
  }>): Promise<BusinessHours[]>;
}

const mapRow = (row: any): BusinessHours => ({
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

export class PostgresBusinessHoursGatewayReader implements BusinessHoursGatewayReader {
  private readonly key: Buffer;

  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  async replace(actor: number, businessId: number, hours: BusinessHoursGatewayReader['replace'] extends (...args: any[]) => any ? Parameters<BusinessHoursGatewayReader['replace']>[2] : never): Promise<BusinessHours[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const context = { businessId, hours };
      const assertion = createActorGatewayAssertion(this.key, actor, 'business.hours.replace', context);
      const result = await client.query(
        'SELECT * FROM ghm.gateway_replace_business_hours($1,$2,$3,$4,$5,$6,$7::jsonb) ORDER BY day_of_week,id',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, businessId, JSON.stringify(hours)],
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
}

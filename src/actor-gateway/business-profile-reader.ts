import type { Pool, PoolClient } from 'pg';

export interface GatewayBusinessProfileUpdate {
  businessId: number;
}

export interface BusinessProfileReader {
  updateBusinessProfile(accountId: number, businessId: number, patch: Record<string, unknown>): Promise<GatewayBusinessProfileUpdate>;
}

type ConnectablePool = Pick<Pool, 'connect'>;

export class PostgresBusinessProfileReader implements BusinessProfileReader {
  constructor(private readonly pool: ConnectablePool) {}

  async updateBusinessProfile(accountId: number, businessId: number, patch: Record<string, unknown>): Promise<GatewayBusinessProfileUpdate> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string | number }>(
        'SELECT (ghm.gateway_update_business_profile($1, $2, $3::jsonb)).id AS id',
        [accountId, businessId, JSON.stringify(patch)],
      );
      if (result.rowCount !== 1) {
        throw Object.assign(new Error('Business profile is unavailable'), { code: '42501' });
      }
      const updated = { businessId: Number(result.rows[0].id) };
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

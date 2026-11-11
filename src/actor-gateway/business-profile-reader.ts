import { createHmac, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export interface GatewayBusinessProfileUpdate { businessId: number; }
export interface BusinessProfileReader {
  updateBusinessProfile(accountId: number, businessId: number, patch: Record<string, unknown>): Promise<GatewayBusinessProfileUpdate>;
}
type ConnectablePool = Pick<Pool, 'connect'>;

export class PostgresBusinessProfileReader implements BusinessProfileReader {
  private readonly assertionKey: Buffer;
  constructor(private readonly pool: ConnectablePool, assertionSecretBase64: string) {
    const key=Buffer.from(assertionSecretBase64,'base64');
    if(key.length!==32 || key.toString('base64')!==assertionSecretBase64) throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    this.assertionKey=key;
  }

  async updateBusinessProfile(accountId: number, businessId: number, patch: Record<string, unknown>): Promise<GatewayBusinessProfileUpdate> {
    const issuedAt=Math.floor(Date.now()/1000),nonce=randomUUID();
    const payload=`ghm-actor-gateway:v1|${accountId}|business.profile.update|${issuedAt}|${nonce}`;
    const signature=createHmac('sha256',this.assertionKey).update(payload,'utf8').digest('hex');
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ id: string | number }>(
        'SELECT updated.id FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6::jsonb) AS updated',
        [accountId,issuedAt,nonce,signature,businessId,JSON.stringify(patch)],
      );
      if (result.rowCount !== 1) throw Object.assign(new Error('Business profile is unavailable'), { code: '42501' });
      const updated = { businessId: Number(result.rows[0].id) };
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
}

import type { Pool } from 'pg';
import { createActorGatewayAssertion } from './request-assertion';

type ConnectablePool = Pick<Pool, 'connect'>;

export interface BusinessLogoGatewayReader {
  bind(actor: number, businessId: number, objectId: number | null): Promise<number | null>;
}

export class PostgresBusinessLogoGatewayReader implements BusinessLogoGatewayReader {
  private readonly key: Buffer;

  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  async bind(actor: number, businessId: number, objectId: number | null): Promise<number | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const context = { businessId, objectId };
      const assertion = createActorGatewayAssertion(this.key, actor, 'business.logo.bind', context);
      const result = await client.query(
        'SELECT ghm.gateway_set_business_logo_object($1,$2,$3,$4,$5,$6,$7) AS previous_object_id',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, businessId, objectId],
      );
      await client.query('COMMIT');
      const previous = result.rows[0]?.previous_object_id;
      return previous === null || previous === undefined ? null : Number(previous);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

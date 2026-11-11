import { createHmac, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export interface GatewaySupplierClassification {
  businessId: number;
  isSupplier: boolean;
}

export interface SupplierClassificationReader {
  updateSupplierClassification(accountId: number, businessId: number, isSupplier: boolean): Promise<GatewaySupplierClassification>;
}

type ConnectablePool = Pick<Pool, 'connect'>;

export class PostgresSupplierClassificationReader implements SupplierClassificationReader {
  private readonly assertionKey: Buffer;
  constructor(private readonly pool: ConnectablePool, assertionSecretBase64: string) {
    const key = Buffer.from(assertionSecretBase64, 'base64');
    if (key.length !== 32 || key.toString('base64') !== assertionSecretBase64) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.assertionKey = key;
  }

  async updateSupplierClassification(accountId: number, businessId: number, isSupplier: boolean): Promise<GatewaySupplierClassification> {
    const issuedAt = Math.floor(Date.now() / 1000), nonce = randomUUID();
    const payload = `ghm-actor-gateway:v1|${accountId}|supplier.classification.update|${issuedAt}|${nonce}`;
    const signature = createHmac('sha256', this.assertionKey).update(payload, 'utf8').digest('hex');
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ business_id: string | number; is_supplier: boolean }>(
        'SELECT * FROM ghm.gateway_update_business_supplier_classification($1,$2,$3,$4,$5,$6)',
        [accountId, issuedAt, nonce, signature, businessId, isSupplier],
      );
      if (result.rowCount !== 1) {
        throw Object.assign(new Error('Supplier classification is unavailable'), { code: '42501' });
      }
      const row = result.rows[0];
      await client.query('COMMIT');
      return { businessId: Number(row.business_id), isSupplier: row.is_supplier === true };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

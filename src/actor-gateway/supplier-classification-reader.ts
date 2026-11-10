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
  constructor(private readonly pool: ConnectablePool) {}

  async updateSupplierClassification(accountId: number, businessId: number, isSupplier: boolean): Promise<GatewaySupplierClassification> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ business_id: string | number; is_supplier: boolean }>(
        'SELECT * FROM ghm.gateway_update_business_supplier_classification($1, $2, $3)',
        [accountId, businessId, isSupplier],
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

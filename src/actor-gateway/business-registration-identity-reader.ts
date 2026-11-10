import type { Pool, PoolClient } from 'pg';

export interface GatewayBusinessRegistrationIdentity {
  businessId: number;
  registrationStatus: 'registered' | 'unregistered' | null;
  registrationNumber: string | null;
  legalName: string | null;
  updatedAt: Date | null;
}

export interface GatewayBusinessRegistrationIdentityUpdate {
  businessId: number;
  registrationStatus: 'registered' | 'unregistered' | null;
  registrationNumber: string | null;
  legalName: string | null;
}

export interface BusinessRegistrationIdentityReader {
  readRegistrationIdentity(accountId: number, businessId: number): Promise<GatewayBusinessRegistrationIdentity>;
  updateRegistrationIdentity(accountId: number, input: GatewayBusinessRegistrationIdentityUpdate): Promise<GatewayBusinessRegistrationIdentity>;
}

type ConnectablePool = Pick<Pool, 'connect'>;

export class PostgresBusinessRegistrationIdentityReader implements BusinessRegistrationIdentityReader {
  constructor(private readonly pool: ConnectablePool) {}

  async readRegistrationIdentity(accountId: number, businessId: number): Promise<GatewayBusinessRegistrationIdentity> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        business_id: string | number;
        registration_status: 'registered' | 'unregistered' | null;
        registration_number: string | null;
        legal_name: string | null;
        updated_at: Date | null;
      }>(
        'SELECT * FROM ghm.gateway_read_business_registration_identity($1, $2)',
        [accountId, businessId],
      );
      if (result.rowCount !== 1) {
        throw Object.assign(new Error('Business registration identity is unavailable'), { code: '42501' });
      }
      const row = result.rows[0];
      await client.query('COMMIT');
      return {
        businessId: Number(row.business_id),
        registrationStatus: row.registration_status,
        registrationNumber: row.registration_number,
        legalName: row.legal_name,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async updateRegistrationIdentity(accountId: number, input: GatewayBusinessRegistrationIdentityUpdate): Promise<GatewayBusinessRegistrationIdentity> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        business_id: string | number;
        registration_status: 'registered' | 'unregistered' | null;
        registration_number: string | null;
        legal_name: string | null;
        updated_at: Date | null;
      }>(
        'SELECT * FROM ghm.gateway_update_business_registration_identity($1, $2, $3, $4, $5)',
        [accountId, input.businessId, input.registrationStatus, input.registrationNumber, input.legalName],
      );
      if (result.rowCount !== 1) {
        throw Object.assign(new Error('Business registration identity is unavailable'), { code: '42501' });
      }
      const row = result.rows[0];
      await client.query('COMMIT');
      return {
        businessId: Number(row.business_id),
        registrationStatus: row.registration_status,
        registrationNumber: row.registration_number,
        legalName: row.legal_name,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

import { createHmac, randomUUID } from 'node:crypto';
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
  private readonly assertionKey: Buffer;
  constructor(private readonly pool: ConnectablePool, assertionSecretBase64: string) {
    const key=Buffer.from(assertionSecretBase64,'base64');
    if(key.length!==32 || key.toString('base64')!==assertionSecretBase64) throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    this.assertionKey=key;
  }
  private assertion(accountId:number,operation:'business.registration.read'|'business.registration.update') { const issuedAt=Math.floor(Date.now()/1000),nonce=randomUUID(); const payload=`ghm-actor-gateway:v1|${accountId}|${operation}|${issuedAt}|${nonce}`; const signature=createHmac('sha256',this.assertionKey).update(payload,'utf8').digest('hex'); return {issuedAt,nonce,signature}; }

  async readRegistrationIdentity(accountId: number, businessId: number): Promise<GatewayBusinessRegistrationIdentity> {
    const assertion=this.assertion(accountId,'business.registration.read');
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
        'SELECT * FROM ghm.gateway_read_business_registration_identity($1,$2,$3,$4,$5)',
        [accountId,assertion.issuedAt,assertion.nonce,assertion.signature,businessId],
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
    const assertion=this.assertion(accountId,'business.registration.update');
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
        'SELECT * FROM ghm.gateway_update_business_registration_identity($1,$2,$3,$4,$5,$6,$7,$8)',
        [accountId,assertion.issuedAt,assertion.nonce,assertion.signature,input.businessId,input.registrationStatus,input.registrationNumber,input.legalName],
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

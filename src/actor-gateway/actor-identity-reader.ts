import { createHmac, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export interface ActorIdentity {
  accountId: number;
  role: string;
  fullName: string | null;
}

export interface ActorIdentityReader {
  readOwnIdentity(accountId: number): Promise<ActorIdentity>;
}

type ConnectablePool = Pick<Pool, 'connect'>;

export class PostgresActorIdentityReader implements ActorIdentityReader {
  private readonly assertionKey: Buffer;
  constructor(private readonly pool: ConnectablePool, assertionSecretBase64: string) {
    const key=Buffer.from(assertionSecretBase64,'base64');
    if(key.length!==32 || key.toString('base64')!==assertionSecretBase64) throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    this.assertionKey=key;
  }

  async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
    const issuedAt=Math.floor(Date.now()/1000),nonce=randomUUID();
    const payload=`ghm-actor-gateway:v1|${accountId}|actor.identity.read|${issuedAt}|${nonce}`;
    const signature=createHmac('sha256',this.assertionKey).update(payload,'utf8').digest('hex');
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        account_id: string | number;
        account_role: string;
        full_name: string | null;
      }>(
        'SELECT account_id, account_role, full_name FROM ghm.gateway_get_actor_identity($1,$2,$3,$4)',
        [accountId,issuedAt,nonce,signature],
      );
      if (result.rowCount !== 1) {
        throw Object.assign(new Error('Actor identity is unavailable'), { code: '42501' });
      }
      const row = result.rows[0];
      await client.query('COMMIT');
      return {
        accountId: Number(row.account_id),
        role: row.account_role,
        fullName: row.full_name,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

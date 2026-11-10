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
  constructor(private readonly pool: ConnectablePool) {}

  async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        account_id: string | number;
        account_role: string;
        full_name: string | null;
      }>(
        'SELECT account_id, account_role, full_name FROM ghm.gateway_get_actor_identity($1)',
        [accountId],
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

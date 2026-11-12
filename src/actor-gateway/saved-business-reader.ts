import type { Pool, PoolClient } from 'pg';
import { createActorGatewayAssertion } from './request-assertion';
import type { SavedBusiness } from '../resources/saved-business/contracts';

type ConnectablePool = Pick<Pool, 'connect'>;

export interface SavedBusinessGatewayReader {
  list(actor: number): Promise<SavedBusiness[]>;
  get(actor: number, savedBusinessId: number): Promise<SavedBusiness | null>;
  create(actor: number, businessId: number): Promise<SavedBusiness>;
  delete(actor: number, savedBusinessId: number): Promise<boolean>;
}

const mapRow = (row: any): SavedBusiness => ({
  id: Number(row.id),
  accountId: Number(row.account_id),
  businessId: Number(row.business_id),
  createdAt: row.created_at,
});

export class PostgresSavedBusinessGatewayReader implements SavedBusinessGatewayReader {
  private readonly key: Buffer;

  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  private async run<T>(
    actor: number,
    operation: 'saved_business.read' | 'saved_business.create' | 'saved_business.delete',
    context: Record<string, unknown>,
    query: (client: PoolClient, assertion: ReturnType<typeof createActorGatewayAssertion>) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const assertion = createActorGatewayAssertion(this.key, actor, operation, context);
      const result = await query(client, assertion);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async list(actor: number): Promise<SavedBusiness[]> {
    return this.run(actor, 'saved_business.read', {}, async (client, a) => {
      const result = await client.query(
        'SELECT * FROM ghm.gateway_list_saved_businesses($1,$2,$3,$4,$5)',
        [actor, a.issuedAt, a.nonce, a.context, a.signature],
      );
      return result.rows.map(mapRow);
    });
  }

  async get(actor: number, savedBusinessId: number): Promise<SavedBusiness | null> {
    return this.run(actor, 'saved_business.read', { savedBusinessId }, async (client, a) => {
      const result = await client.query(
        'SELECT * FROM ghm.gateway_get_saved_business($1,$2,$3,$4,$5,$6)',
        [actor, a.issuedAt, a.nonce, a.context, a.signature, savedBusinessId],
      );
      return result.rowCount === 1 ? mapRow(result.rows[0]) : null;
    });
  }

  async create(actor: number, businessId: number): Promise<SavedBusiness> {
    return this.run(actor, 'saved_business.create', { businessId }, async (client, a) => {
      const result = await client.query(
        'SELECT * FROM ghm.gateway_create_saved_business($1,$2,$3,$4,$5,$6)',
        [actor, a.issuedAt, a.nonce, a.context, a.signature, businessId],
      );
      if (result.rowCount !== 1) throw Object.assign(new Error('Saved Business create returned no row'), { code: 'P0001' });
      return mapRow(result.rows[0]);
    });
  }

  async delete(actor: number, savedBusinessId: number): Promise<boolean> {
    return this.run(actor, 'saved_business.delete', { savedBusinessId }, async (client, a) => {
      const result = await client.query(
        'SELECT ghm.gateway_delete_saved_business($1,$2,$3,$4,$5,$6) AS deleted',
        [actor, a.issuedAt, a.nonce, a.context, a.signature, savedBusinessId],
      );
      return result.rows[0]?.deleted === true;
    });
  }
}

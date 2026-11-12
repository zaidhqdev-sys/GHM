import type { Pool, PoolClient } from 'pg';
import { createActorGatewayAssertion } from './request-assertion';

export interface GatewayStorageMetadataInput {
  businessId: number;
  resourceType: 'business';
  resourceId: number;
  objectClass: 'business_logo';
  providerKey: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  visibility: 'public';
  originalFilename: string | null;
}
export interface GatewayStorageMetadataRow {
  id: string;
  tenant_business_id: string;
  resource_type: string;
  resource_id: string;
  object_class: string;
  provider_key: string;
  content_type: string;
  byte_size: string | number;
  visibility: string;
  status: string;
}
export interface StorageMetadataGatewayReader {
  createPending(actor: number, input: GatewayStorageMetadataInput): Promise<GatewayStorageMetadataRow>;
  getObject(actor: number, objectId: number): Promise<GatewayStorageMetadataRow | null>;
  markDeletionPending(actor: number, objectId: number): Promise<GatewayStorageMetadataRow>;
}
type ConnectablePool = Pick<Pool, 'connect'>;

export class PostgresStorageMetadataGatewayReader implements StorageMetadataGatewayReader {
  private readonly key: Buffer;
  constructor(private readonly pool: ConnectablePool, secret: string) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    this.key = key;
  }

  private async withClient<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async createPending(actor: number, input: GatewayStorageMetadataInput): Promise<GatewayStorageMetadataRow> {
    return this.withClient(async client => {
      const assertion = createActorGatewayAssertion(this.key, actor, 'storage.metadata.create', input);
      const result = await client.query<GatewayStorageMetadataRow>(
        'SELECT * FROM ghm.gateway_storage_create_pending($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature,
          input.businessId, input.resourceType, input.resourceId, input.objectClass, input.providerKey,
          input.contentType, input.byteSize, input.visibility, input.originalFilename],
      );
      if (result.rowCount !== 1) throw Object.assign(new Error('Storage metadata creation denied'), { code: '42501' });
      return result.rows[0];
    });
  }

  async getObject(actor: number, objectId: number): Promise<GatewayStorageMetadataRow | null> {
    return this.withClient(async client => {
      const context = { objectId };
      const assertion = createActorGatewayAssertion(this.key, actor, 'storage.metadata.read', context);
      const result = await client.query<GatewayStorageMetadataRow>(
        'SELECT * FROM ghm.gateway_storage_get_object($1,$2,$3,$4,$5,$6)',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, objectId],
      );
      return result.rowCount === 1 ? result.rows[0] : null;
    });
  }

  async markDeletionPending(actor: number, objectId: number): Promise<GatewayStorageMetadataRow> {
    return this.withClient(async client => {
      const context = { objectId };
      const assertion = createActorGatewayAssertion(this.key, actor, 'storage.metadata.mark_deletion_pending', context);
      const result = await client.query<GatewayStorageMetadataRow>(
        'SELECT * FROM ghm.gateway_storage_mark_deletion_pending($1,$2,$3,$4,$5,$6)',
        [actor, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, objectId],
      );
      if (result.rowCount !== 1) throw Object.assign(new Error('Storage deletion request denied'), { code: '42501' });
      return result.rows[0];
    });
  }
}

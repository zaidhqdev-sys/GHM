import type { PoolClient } from "pg";
import { withAuthorizedTransaction } from "../db/authorized-transaction.js";
import type { AuthContext } from "../auth/authorization.js";
import type { StorageMetadataRecord, StorageMetadataStore } from "./service.js";

const mapStorageMetadata = (row: any): StorageMetadataRecord => ({
  id: String(row.id),
  businessId: String(row.tenant_business_id),
  resourceType: String(row.resource_type),
  resourceId: String(row.resource_id),
  objectClass: row.object_class,
  providerKey: String(row.provider_key),
  contentType: String(row.content_type),
  byteSize: Number(row.byte_size),
  visibility: row.visibility,
  status: row.status,
});

export class PostgresStorageMetadataStore implements StorageMetadataStore {
  constructor(private readonly client: Pick<PoolClient, "query">) {}

  async createPending(input: Omit<StorageMetadataRecord, "id" | "status">): Promise<StorageMetadataRecord> {
    const result = await this.client.query(
      "SELECT ghm.storage_create_pending($1,$2,$3,$4,$5,$6,$7,$8,NULL) AS row",
      [Number(input.businessId), input.resourceType, Number(input.resourceId), input.objectClass, input.providerKey, input.contentType, input.byteSize, input.visibility],
    );
    return mapStorageMetadata(result.rows[0].row);
  }

  async markAvailable(id: string, checksum?: string | null): Promise<StorageMetadataRecord> {
    const result = await this.client.query("SELECT ghm.storage_mark_available($1,$2) AS row", [Number(id), checksum ?? null]);
    return mapStorageMetadata(result.rows[0].row);
  }

  async markDeletionPending(id: string): Promise<StorageMetadataRecord> {
    const result = await this.client.query("SELECT ghm.storage_mark_deletion_pending($1) AS row", [Number(id)]);
    return mapStorageMetadata(result.rows[0].row);
  }

  async markDeleted(id: string): Promise<StorageMetadataRecord> {
    const result = await this.client.query("SELECT ghm.storage_mark_deleted($1) AS row", [Number(id)]);
    return mapStorageMetadata(result.rows[0].row);
  }

  async getById(id: string): Promise<StorageMetadataRecord | null> {
    try {
      const result = await this.client.query("SELECT ghm.storage_get_object($1) AS row", [Number(id)]);
      return result.rowCount === 1 ? mapStorageMetadata(result.rows[0].row) : null;
    } catch (error) {
      if (error instanceof Error && error.message === "storage object does not exist") return null;
      throw error;
    }
  }
}

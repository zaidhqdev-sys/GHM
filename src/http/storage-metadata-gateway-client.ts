import { assertActorGatewayBaseUrl } from './actor-gateway-url';
import { createStorageProviderWorkflowAttestation } from './storage-provider-attestation';
import type { StorageMetadataRecord, StorageMetadataStore } from '../storage/service';

interface GatewayStorageObject {
  id: string;
  tenant_business_id: string;
  resource_type: string;
  resource_id: string;
  object_class: string;
  provider_key: string;
  content_type: string;
  byte_size: string | number;
  visibility: string;
  status: StorageMetadataRecord['status'];
  checksum?: string | null;
}
export class StorageMetadataGatewayError extends Error {
  constructor(readonly status: number) {
    super('Storage metadata gateway request failed');
    this.name = 'StorageMetadataGatewayError';
  }
}
const mapObject = (row: GatewayStorageObject): StorageMetadataRecord => ({
  id: String(row.id),
  businessId: String(row.tenant_business_id),
  resourceType: row.resource_type,
  resourceId: String(row.resource_id),
  objectClass: row.object_class as StorageMetadataRecord['objectClass'],
  providerKey: row.provider_key,
  contentType: row.content_type,
  byteSize: Number(row.byte_size),
  visibility: row.visibility as StorageMetadataRecord['visibility'],
  status: row.status,
  checksum: row.checksum ?? null,
});

export class HttpStorageMetadataGatewayClient implements StorageMetadataStore {
  private readonly origin: string;
  constructor(
    baseUrl: string,
    private readonly accessToken: string,
    private readonly providerAttestationSecret: string,
    private readonly timeoutMs = 5_000,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.origin = assertActorGatewayBaseUrl(baseUrl).origin;
    if (!accessToken.trim()) throw new Error('Storage metadata gateway bearer token is required');
    // Validate the provider key at construction; never defer a missing signer
    // until after a provider side effect has already happened.
    const key = Buffer.from(providerAttestationSecret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== providerAttestationSecret) {
      throw new Error('GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET must be canonical base64 for exactly 32 bytes');
    }
  }

  private async request(path: string, method: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.origin}${path}`, {
        method,
        redirect: 'error',
        headers: {
          authorization: `Bearer ${this.accessToken}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new StorageMetadataGatewayError(response.status);
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > 65536) throw new Error('Storage metadata gateway response is too large');
      try { return JSON.parse(text) as unknown; } catch { throw new Error('Storage metadata gateway response is invalid'); }
    } finally {
      clearTimeout(timeout);
    }
  }

  private objectFrom(payload: unknown): StorageMetadataRecord {
    if (!payload || typeof payload !== 'object' || !('object' in payload)) {
      throw new Error('Storage metadata gateway response is invalid');
    }
    const row = (payload as { object: unknown }).object;
    if (!row || typeof row !== 'object') throw new Error('Storage metadata gateway response is invalid');
    const value = row as GatewayStorageObject;
    if (typeof value.id !== 'string' && typeof value.id !== 'number') throw new Error('Storage metadata gateway response is invalid');
    if (typeof value.tenant_business_id !== 'string' && typeof value.tenant_business_id !== 'number') throw new Error('Storage metadata gateway response is invalid');
    if (typeof value.provider_key !== 'string' || typeof value.content_type !== 'string' || !Number.isFinite(Number(value.byte_size))) {
      throw new Error('Storage metadata gateway response is invalid');
    }
    return mapObject(value);
  }

  async createPending(input: Omit<StorageMetadataRecord, 'id' | 'status'>): Promise<StorageMetadataRecord> {
    const payload = await this.request('/v1/storage/metadata', 'POST', {
      businessId: Number(input.businessId),
      resourceId: Number(input.resourceId),
      providerKey: input.providerKey,
      contentType: input.contentType,
      byteSize: input.byteSize,
      originalFilename: null,
    });
    return this.objectFrom(payload);
  }

  async getById(id: string): Promise<StorageMetadataRecord | null> {
    let payload: unknown;
    try { payload = await this.request(`/v1/storage/metadata/${encodeURIComponent(id)}`, 'GET'); }
    catch (error) {
      if (error instanceof StorageMetadataGatewayError && error.status === 404) return null;
      throw error;
    }
    return this.objectFrom(payload);
  }

  async markDeletionPending(id: string): Promise<StorageMetadataRecord> {
    const payload = await this.request(`/v1/storage/metadata/${encodeURIComponent(id)}/deletion-pending`, 'POST');
    return this.objectFrom(payload);
  }

  async markAvailable(id: string, checksum: string | null | undefined, evidence: StorageMetadataRecord): Promise<StorageMetadataRecord> {
    const objectId = Number(id);
    const businessId = Number(evidence.businessId);
    const attestation = createStorageProviderWorkflowAttestation(
      this.providerAttestationSecret,
      'storage.provider.mark_available',
      {
        businessId, objectId, providerKey: evidence.providerKey,
        contentType: evidence.contentType, byteSize: evidence.byteSize, checksum: checksum ?? null,
      },
    );
    const payload = await this.request(`/v1/storage/metadata/${encodeURIComponent(id)}/available`, 'POST', {
      checksum: checksum ?? null,
      providerKey: evidence.providerKey,
      contentType: evidence.contentType,
      byteSize: evidence.byteSize,
      attestation,
    });
    return this.objectFrom(payload);
  }

  async markDeleted(id: string, evidence: StorageMetadataRecord): Promise<StorageMetadataRecord> {
    const objectId = Number(id);
    const businessId = Number(evidence.businessId);
    const attestation = createStorageProviderWorkflowAttestation(
      this.providerAttestationSecret,
      'storage.provider.mark_deleted',
      { businessId, objectId, providerKey: evidence.providerKey },
    );
    const payload = await this.request(`/v1/storage/metadata/${encodeURIComponent(id)}/deleted`, 'POST', {
      providerKey: evidence.providerKey,
      attestation,
    });
    return this.objectFrom(payload);
  }
}

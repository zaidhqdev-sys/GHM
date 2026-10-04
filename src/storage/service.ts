import { createBusinessLogoProviderKey } from "./key.js";
import type {
  StorageDownloadGrant,
  StorageProvider,
  StorageUploadGrant,
} from "./provider.js";

export type StorageObjectClass = "business_logo";

export interface StorageCaller {
  userId: string;
  businessId: string;
}

export interface StorageResource {
  type: string;
  id: string;
  businessId: string;
}

export interface StoragePolicy {
  contentTypes: readonly string[];
  maxBytes: number;
  visibility: "public" | "authenticated" | "private" | "internal";
}

export interface StorageMetadataRecord {
  id: string;
  businessId: string;
  resourceType: string;
  resourceId: string;
  objectClass: StorageObjectClass;
  providerKey: string;
  contentType: string;
  byteSize: number;
  visibility: StoragePolicy["visibility"];
  status: "pending" | "available" | "deletion_pending" | "deleted";
}

export interface StorageMetadataStore {
  createPending(input: Omit<StorageMetadataRecord, "id" | "status">): Promise<StorageMetadataRecord>;
  markAvailable(id: string, checksum?: string | null): Promise<StorageMetadataRecord>;
  markDeletionPending(id: string): Promise<StorageMetadataRecord>;
  markDeleted(id: string): Promise<StorageMetadataRecord>;
  getById(id: string): Promise<StorageMetadataRecord | null>;
}

export interface StorageAuthorization {
  assertCanManage(caller: StorageCaller, resource: StorageResource): Promise<void>;
  assertCanRead(caller: StorageCaller, record: StorageMetadataRecord): Promise<void>;
  assertCanDelete(caller: StorageCaller, record: StorageMetadataRecord): Promise<void>;
}

export interface StorageService {
  createUpload(input: {
    caller: StorageCaller;
    resource: StorageResource;
    objectClass: StorageObjectClass;
    contentType: string;
    byteSize: number;
    originalFilename?: string | null;
  }): Promise<{ objectId: string; providerKey: string; grant: StorageUploadGrant }>;

  completeUpload(input: {
    caller: StorageCaller;
    objectId: string;
  }): Promise<StorageMetadataRecord>;

  getAccess(input: {
    caller: StorageCaller;
    objectId: string;
    expiresInSeconds: number;
  }): Promise<StorageDownloadGrant>;

  deleteObject(input: {
    caller: StorageCaller;
    objectId: string;
  }): Promise<void>;
}

const POLICIES: Record<StorageObjectClass, StoragePolicy> = {
  business_logo: {
    contentTypes: ["image/jpeg", "image/png", "image/webp"],
    maxBytes: 2 * 1024 * 1024,
    visibility: "public",
  },
};

export function storagePolicyFor(objectClass: StorageObjectClass): StoragePolicy {
  return POLICIES[objectClass];
}

export function createStorageService(deps: {
  provider: StorageProvider;
  metadata: StorageMetadataStore;
  authorization: StorageAuthorization;
}): StorageService {
  return {
    async createUpload(input) {
      const policy = storagePolicyFor(input.objectClass);
      if (!policy.contentTypes.includes(input.contentType)) {
        throw new Error("unsupported storage content type");
      }
      if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0 || input.byteSize > policy.maxBytes) {
        throw new Error("storage object exceeds policy");
      }

      await deps.authorization.assertCanManage(input.caller, input.resource);

      const objectId = crypto.randomUUID();
      const providerKey = createBusinessLogoProviderKey(input.resource.businessId, objectId);
      const metadata = await deps.metadata.createPending({
        businessId: input.resource.businessId,
        resourceType: input.resource.type,
        resourceId: input.resource.id,
        objectClass: input.objectClass,
        providerKey,
        contentType: input.contentType,
        byteSize: input.byteSize,
        visibility: policy.visibility,
      });

      try {
        const grant = await deps.provider.createUploadGrant({
          key: providerKey,
          contentType: input.contentType,
          byteSize: input.byteSize,
          expiresInSeconds: 900,
        });
        return { objectId: metadata.id, providerKey, grant };
      } catch (error) {
        throw error;
      }
    },

    async completeUpload(input) {
      const record = await deps.metadata.getById(input.objectId);
      if (!record) throw new Error("storage object not found");
      const resource: StorageResource = {
        type: record.resourceType,
        id: record.resourceId,
        businessId: record.businessId,
      };
      await deps.authorization.assertCanManage(input.caller, resource);
      const providerObject = await deps.provider.headObject(record.providerKey);
      if (providerObject.byteSize !== record.byteSize || providerObject.contentType !== record.contentType) {
        throw new Error("storage provider metadata mismatch");
      }
      return deps.metadata.markAvailable(record.id, providerObject.checksum);
    },

    async getAccess(input) {
      if (!Number.isSafeInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 || input.expiresInSeconds > 3600) {
        throw new Error("invalid storage access grant expiry");
      }
      const record = await deps.metadata.getById(input.objectId);
      if (!record || record.status === "deleted" || record.status === "deletion_pending") {
        throw new Error("storage object not available");
      }
      await deps.authorization.assertCanRead(input.caller, record);
      return deps.provider.createDownloadGrant({
        key: record.providerKey,
        expiresInSeconds: input.expiresInSeconds,
      });
    },

    async deleteObject(input) {
      const record = await deps.metadata.getById(input.objectId);
      if (!record || record.status !== "available") throw new Error("storage object not available");
      await deps.authorization.assertCanDelete(input.caller, record);
      await deps.metadata.markDeletionPending(record.id);
      try {
        await deps.provider.deleteObject(record.providerKey);
        await deps.metadata.markDeleted(record.id);
      } catch (error) {
        throw error;
      }
    },
  };
}

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
  checksum?: string | null;
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
  uploadGrantTtlSeconds?: number;
  downloadGrantMaxTtlSeconds?: number;
}): StorageService {
  const uploadGrantTtlSeconds = deps.uploadGrantTtlSeconds ?? 900;
  const downloadGrantMaxTtlSeconds = deps.downloadGrantMaxTtlSeconds ?? 3600;
  if (!Number.isSafeInteger(uploadGrantTtlSeconds) || uploadGrantTtlSeconds < 1 || uploadGrantTtlSeconds > 3600) {
    throw new Error("invalid storage upload grant expiry");
  }
  if (!Number.isSafeInteger(downloadGrantMaxTtlSeconds) || downloadGrantMaxTtlSeconds < 1 || downloadGrantMaxTtlSeconds > 3600) {
    throw new Error("invalid storage download grant expiry");
  }
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
          expiresInSeconds: uploadGrantTtlSeconds,
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
      if (!Number.isSafeInteger(input.expiresInSeconds) || input.expiresInSeconds < 1 || input.expiresInSeconds > downloadGrantMaxTtlSeconds) {
        throw new Error("invalid storage grant expiry");
      }
      const record = await deps.metadata.getById(input.objectId);
      if (!record || record.status !== "available") {
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
      if (!record || (record.status !== "available" && record.status !== "deletion_pending")) {
        throw new Error("storage object not available");
      }
      await deps.authorization.assertCanDelete(input.caller, record);
      // A previous attempt may have marked the row deletion_pending before the
      // provider or final metadata update failed. Retrying the provider delete
      // is safe for object stores and lets the lifecycle recover without
      // reopening the object for reads or requiring a manual DB edit.
      if (record.status === "available") await deps.metadata.markDeletionPending(record.id);
      await deps.provider.deleteObject(record.providerKey);
      await deps.metadata.markDeleted(record.id);
    },
  };
}

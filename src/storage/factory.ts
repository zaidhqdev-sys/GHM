import type { StorageRuntimeConfig } from "./config.js";
import type { StorageProvider } from "./provider.js";
import { S3StorageProvider } from "./s3-provider.js";

export function createStorageProvider(config: StorageRuntimeConfig): StorageProvider {
  switch (config.provider) {
    case "s3":
      return new S3StorageProvider({
        endpoint: config.endpoint,
        region: config.region,
        bucket: config.bucket,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        forcePathStyle: config.forcePathStyle,
      });
    default: {
      const unsupported: never = config.provider;
      throw new Error(`Unsupported storage provider: ${String(unsupported)}`);
    }
  }
}

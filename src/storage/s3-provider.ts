import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  StorageProviderError,
  type StorageDownloadGrant,
  type StorageProvider,
  type StorageProviderObject,
  type StorageUploadGrant,
} from "./provider.js";

export interface S3StorageProviderOptions {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageProviderOptions) {
    if (!options.bucket.trim()) throw new Error("storage bucket must not be empty");
    if (!options.region.trim()) throw new Error("storage region must not be empty");

    this.bucket = options.bucket;
    this.client = new S3Client({
      endpoint: options.endpoint?.trim() || undefined,
      region: options.region,
      forcePathStyle: options.forcePathStyle ?? Boolean(options.endpoint),
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async putObject(input: {
    key: string;
    body: Uint8Array | ReadableStream;
    contentType: string;
  }): Promise<void> {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body as never,
        ContentType: input.contentType,
      }));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async headObject(key: string): Promise<StorageProviderObject> {
    try {
      const result = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      if (result.ContentLength === undefined) {
        throw new StorageProviderError("INVALID_OBJECT", "provider object has no byte size");
      }
      return {
        key,
        contentType: result.ContentType ?? "application/octet-stream",
        byteSize: result.ContentLength,
        checksum: result.ChecksumSHA256 ?? result.ETag?.replace(/^"|"$/g, "") ?? null,
      };
    } catch (error) {
      if (error instanceof StorageProviderError) throw error;
      throw this.mapError(error);
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async createUploadGrant(input: {
    key: string;
    contentType: string;
    byteSize: number;
    expiresInSeconds: number;
  }): Promise<StorageUploadGrant> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn: input.expiresInSeconds,
      });
      return {
        url,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
        headers: { "content-type": input.contentType },
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async createDownloadGrant(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<StorageDownloadGrant> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn: input.expiresInSeconds,
      });
      return {
        url,
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): StorageProviderError {
    const status = typeof error === "object" && error !== null && "$metadata" in error
      ? Number((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode)
      : undefined;
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message : "storage provider error";

    if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
      return new StorageProviderError("NOT_FOUND", message);
    }
    if (status === 403 || name === "AccessDenied") {
      return new StorageProviderError("ACCESS_DENIED", message);
    }
    if (status === 409 || name === "Conflict") {
      return new StorageProviderError("CONFLICT", message);
    }
    if (status === 413) {
      return new StorageProviderError("PAYLOAD_TOO_LARGE", message);
    }
    if (status !== undefined && status >= 500) {
      return new StorageProviderError("PROVIDER_UNAVAILABLE", message, true);
    }
    return new StorageProviderError("UNKNOWN", message);
  }
}

export type StorageProviderErrorCode =
  | "NOT_FOUND"
  | "CONFLICT"
  | "ACCESS_DENIED"
  | "INVALID_OBJECT"
  | "PAYLOAD_TOO_LARGE"
  | "PROVIDER_UNAVAILABLE"
  | "INTEGRITY_MISMATCH"
  | "UNKNOWN";

export interface StorageProviderObject {
  key: string;
  contentType: string;
  byteSize: number;
  checksum?: string | null;
}

export interface StorageUploadGrant {
  url: string;
  expiresAt: Date;
  headers: Record<string, string>;
}

export interface StorageDownloadGrant {
  url: string;
  expiresAt: Date;
}

export interface StorageProvider {
  putObject(input: {
    key: string;
    body: Uint8Array | ReadableStream;
    contentType: string;
  }): Promise<void>;

  headObject(key: string): Promise<StorageProviderObject>;

  deleteObject(key: string): Promise<void>;

  createUploadGrant(input: {
    key: string;
    contentType: string;
    byteSize: number;
    expiresInSeconds: number;
  }): Promise<StorageUploadGrant>;

  createDownloadGrant(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<StorageDownloadGrant>;
}

export class StorageProviderError extends Error {
  readonly code: StorageProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: StorageProviderErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "StorageProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

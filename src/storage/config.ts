export type StorageProviderKind = "s3";

export interface StorageRuntimeConfig {
  provider: StorageProviderKind;
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  uploadGrantTtlSeconds: number;
  downloadGrantMaxTtlSeconds: number;
}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required storage environment variable: ${name}`);
  return value;
};

const optional = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name]?.trim();
  return value || undefined;
};

const positiveInteger = (env: NodeJS.ProcessEnv, name: string, fallback: number): number => {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};

const boolean = (env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean => {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw !== "true" && raw !== "false") throw new Error(`${name} must be true or false`);
  return raw === "true";
};

export const loadStorageRuntimeConfig = (env: NodeJS.ProcessEnv = process.env): StorageRuntimeConfig => {
  const provider = (env.STORAGE_PROVIDER?.trim() || "s3") as StorageProviderKind;
  if (provider !== "s3") throw new Error("STORAGE_PROVIDER must be s3");

  const endpoint = optional(env, "STORAGE_ENDPOINT");
  const region = required(env, "STORAGE_REGION");
  const bucket = required(env, "STORAGE_BUCKET");
  const accessKeyId = required(env, "STORAGE_ACCESS_KEY_ID");
  const secretAccessKey = required(env, "STORAGE_SECRET_ACCESS_KEY");
  const forcePathStyle = boolean(env, "STORAGE_FORCE_PATH_STYLE", Boolean(endpoint));
  const uploadGrantTtlSeconds = positiveInteger(env, "STORAGE_UPLOAD_GRANT_TTL_SECONDS", 900);
  const downloadGrantMaxTtlSeconds = positiveInteger(env, "STORAGE_DOWNLOAD_GRANT_MAX_TTL_SECONDS", 3600);

  if (uploadGrantTtlSeconds > 3600) {
    throw new Error("STORAGE_UPLOAD_GRANT_TTL_SECONDS must not exceed 3600");
  }
  if (downloadGrantMaxTtlSeconds > 3600) {
    throw new Error("STORAGE_DOWNLOAD_GRANT_MAX_TTL_SECONDS must not exceed 3600");
  }

  if (endpoint) {
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new Error("STORAGE_ENDPOINT must be a valid URL"); }
    if (url.protocol !== "https:") throw new Error("STORAGE_ENDPOINT must use HTTPS");
  }

  return Object.freeze({
    provider,
    ...(endpoint ? { endpoint } : {}),
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    uploadGrantTtlSeconds,
    downloadGrantMaxTtlSeconds,
  });
};

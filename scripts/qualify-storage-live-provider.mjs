import "dotenv/config";
import { createHash } from "node:crypto";
import { loadStorageRuntimeConfig } from "../dist/storage/config.js";
import { createStorageProvider } from "../dist/storage/factory.js";
import { StorageProviderError } from "../dist/storage/provider.js";

const config = loadStorageRuntimeConfig();
const provider = createStorageProvider(config);

const key = `qualification/storage-live/${Date.now()}-${crypto.randomUUID()}.bin`;
const contentType = "application/octet-stream";
const body = new TextEncoder().encode("GHM storage live-provider qualification");
const expectedSha256 = createHash("sha256").update(body).digest("hex");

const evidence = [];
let status = "QUALIFIED";

const record = (label, result, details = {}) => {
  evidence.push({ label, status: result, ...details });
  if (result === "FAIL") status = "FAIL";
};

const fetchOrThrow = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from provider grant`);
  }
  return response;
};

try {
  const uploadGrant = await provider.createUploadGrant({
    key,
    contentType,
    byteSize: body.byteLength,
    expiresInSeconds: Math.min(config.uploadGrantTtlSeconds, 300),
  });

  record("signed upload grant", "PASS", {
    https: uploadGrant.url.startsWith("https://"),
    content_type_header: uploadGrant.headers["content-type"],
    expires_at: uploadGrant.expiresAt.toISOString(),
  });

  await fetchOrThrow(uploadGrant.url, {
    method: "PUT",
    headers: uploadGrant.headers,
    body,
  });
  record("signed PUT", "PASS");

  const head = await provider.headObject(key);
  record("provider HEAD", "PASS", {
    content_type: head.contentType,
    byte_size: head.byteSize,
    checksum: head.checksum ?? null,
  });

  if (head.contentType !== contentType) {
    throw new Error(`provider content type mismatch: ${head.contentType}`);
  }
  if (head.byteSize !== body.byteLength) {
    throw new Error(`provider byte size mismatch: ${head.byteSize}`);
  }
  record("provider metadata matches uploaded payload", "PASS");

  const downloadGrant = await provider.createDownloadGrant({
    key,
    expiresInSeconds: Math.min(config.downloadGrantMaxTtlSeconds, 300),
  });
  record("signed download grant", "PASS", {
    https: downloadGrant.url.startsWith("https://"),
    expires_at: downloadGrant.expiresAt.toISOString(),
  });

  const downloaded = new Uint8Array(await (await fetchOrThrow(downloadGrant.url)).arrayBuffer());
  const downloadedSha256 = createHash("sha256").update(downloaded).digest("hex");

  if (downloadedSha256 !== expectedSha256) {
    throw new Error("downloaded payload integrity mismatch");
  }
  record("downloaded payload integrity", "PASS", {
    sha256: downloadedSha256,
    byte_size: downloaded.byteLength,
  });

  await provider.deleteObject(key);
  record("provider DELETE", "PASS");

  try {
    await provider.headObject(key);
    record("deleted object is absent", "FAIL", { reason: "HEAD unexpectedly succeeded" });
  } catch (error) {
    if (error instanceof StorageProviderError && error.code === "NOT_FOUND") {
      record("deleted object is absent", "PASS");
    } else {
      throw error;
    }
  }
} catch (error) {
  record("live provider qualification", "FAIL", {
    error: error instanceof Error ? error.message : String(error),
    provider_error_code: error instanceof StorageProviderError ? error.code : undefined,
  });
  try {
    await provider.deleteObject(key);
    record("qualification cleanup", "PASS");
  } catch {
    record("qualification cleanup", "OBSERVED", { reason: "cleanup could not confirm deletion" });
  }
}

console.log(JSON.stringify({
  status,
  provider: config.provider,
  bucket: config.bucket,
  key,
  evidence,
}, null, 2));

if (status !== "QUALIFIED") process.exitCode = 1;

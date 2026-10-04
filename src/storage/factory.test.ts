import test from "node:test";
import assert from "node:assert/strict";
import { createStorageProvider } from "./factory.js";
import type { StorageRuntimeConfig } from "./config.js";

const config = (overrides: Partial<StorageRuntimeConfig> = {}): StorageRuntimeConfig => ({
  provider: "s3",
  region: "eu-central-1",
  bucket: "test-bucket",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  forcePathStyle: false,
  uploadGrantTtlSeconds: 900,
  downloadGrantMaxTtlSeconds: 3600,
  ...overrides,
});

test("storage provider factory selects the S3 adapter without network access", async () => {
  const provider = createStorageProvider(config());

  const grant = await provider.createUploadGrant({
    key: "objects/factory-test",
    contentType: "image/png",
    byteSize: 123,
    expiresInSeconds: 60,
  });

  assert.match(grant.url, /^https:\/\//);
  assert.equal(grant.headers["content-type"], "image/png");
});

test("storage provider factory passes a custom S3-compatible endpoint through the provider boundary", async () => {
  const provider = createStorageProvider(config({
    endpoint: "https://storage.example.test",
    forcePathStyle: true,
  }));

  const grant = await provider.createUploadGrant({
    key: "objects/factory-endpoint-test",
    contentType: "image/webp",
    byteSize: 10,
    expiresInSeconds: 60,
  });

  assert.match(grant.url, /^https:\/\/storage\.example\.test\//);
  assert.equal(grant.headers["content-type"], "image/webp");
});

test("storage provider factory does not expose runtime credentials through its public result", () => {
  const provider = createStorageProvider(config());
  const publicKeys = Object.keys(provider);

  assert.equal(publicKeys.includes("accessKeyId"), false);
  assert.equal(publicKeys.includes("secretAccessKey"), false);
});

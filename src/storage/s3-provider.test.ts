import test from "node:test";
import assert from "node:assert/strict";
import { S3StorageProvider } from "./s3-provider.js";
import { StorageProviderError } from "./provider.js";

function provider() {
  return new S3StorageProvider({
    bucket: "test-bucket",
    region: "eu-central-1",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
  });
}

test("S3StorageProvider validates credentials and construction inputs", () => {
  assert.throws(() => new S3StorageProvider({
    bucket: "test",
    region: "eu-central-1",
    accessKeyId: "",
    secretAccessKey: "test",
  }));
  assert.throws(() => new S3StorageProvider({
    bucket: "test",
    region: "eu-central-1",
    accessKeyId: "test",
    secretAccessKey: "",
  }));
});

test("S3StorageProvider rejects invalid upload grant policy inputs before signing", async () => {
  await assert.rejects(
    provider().createUploadGrant({ key: "objects/test", contentType: "image/png", byteSize: 1, expiresInSeconds: 0 }),
    (error: unknown) => error instanceof StorageProviderError && error.code === "INVALID_OBJECT",
  );
  await assert.rejects(
    provider().createUploadGrant({ key: "", contentType: "image/png", byteSize: 1, expiresInSeconds: 60 }),
    (error: unknown) => error instanceof StorageProviderError && error.code === "INVALID_OBJECT",
  );
});

test("S3StorageProvider creates an upload grant without provider network access", async () => {
  const grant = await provider().createUploadGrant({
    key: "objects/test",
    contentType: "image/png",
    byteSize: 123,
    expiresInSeconds: 60,
  });
  assert.match(grant.url, /^https:\/\//);
  assert.equal(grant.headers["content-type"], "image/png");
  assert.ok(grant.expiresAt.getTime() > Date.now());
});

test("S3StorageProvider rejects invalid download grant inputs before signing", async () => {
  await assert.rejects(
    provider().createDownloadGrant({ key: "objects/test", expiresInSeconds: 0 }),
    (error: unknown) => error instanceof StorageProviderError && error.code === "INVALID_OBJECT",
  );
});

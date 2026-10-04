import test from "node:test";
import assert from "node:assert/strict";
import { loadStorageRuntimeConfig } from "./config.js";

const base = {
  STORAGE_REGION: "eu-central-1",
  STORAGE_BUCKET: "ghm-production",
  STORAGE_ACCESS_KEY_ID: "test-access-key",
  STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
};

test("storage runtime configuration requires provider identity and credentials", () => {
  assert.throws(() => loadStorageRuntimeConfig({}), /STORAGE_REGION/);
  assert.throws(() => loadStorageRuntimeConfig({ ...base, STORAGE_BUCKET: "" }), /STORAGE_BUCKET/);
  assert.throws(() => loadStorageRuntimeConfig({ ...base, STORAGE_ACCESS_KEY_ID: "" }), /STORAGE_ACCESS_KEY_ID/);
  assert.throws(() => loadStorageRuntimeConfig({ ...base, STORAGE_SECRET_ACCESS_KEY: "" }), /STORAGE_SECRET_ACCESS_KEY/);
});

test("storage runtime configuration defaults to the S3 provider and bounded grant TTLs", () => {
  const config = loadStorageRuntimeConfig(base);
  assert.equal(config.provider, "s3");
  assert.equal(config.forcePathStyle, false);
  assert.equal(config.uploadGrantTtlSeconds, 900);
  assert.equal(config.downloadGrantMaxTtlSeconds, 3600);
  assert.equal("secretAccessKey" in config, true);
});

test("storage runtime configuration validates endpoint transport", () => {
  assert.throws(() => loadStorageRuntimeConfig({ ...base, STORAGE_ENDPOINT: "http://storage.internal" }), /HTTPS/);
  assert.throws(() => loadStorageRuntimeConfig({ ...base, STORAGE_ENDPOINT: "not-a-url" }), /valid URL/);
});

test("storage runtime configuration validates provider selection and TTL bounds", () => {
  assert.throws(() => loadStorageRuntimeConfig({ ...base, STORAGE_PROVIDER: "filesystem" }), /STORAGE_PROVIDER must be s3/);
  assert.throws(() => loadStorageRuntimeConfig({ ...base, STORAGE_UPLOAD_GRANT_TTL_SECONDS: "0" }), /positive integer/);
  assert.throws(() => loadStorageRuntimeConfig({ ...base, STORAGE_DOWNLOAD_GRANT_MAX_TTL_SECONDS: "3601" }), /must not exceed 3600/);
});

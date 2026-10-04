import test from "node:test";
import assert from "node:assert/strict";
import { S3StorageProvider } from "./s3-provider.js";

test("S3StorageProvider rejects empty bucket and region", () => {
  assert.throws(() => new S3StorageProvider({
    bucket: "",
    region: "eu-central-1",
    accessKeyId: "test",
    secretAccessKey: "test",
  }));
  assert.throws(() => new S3StorageProvider({
    bucket: "test",
    region: "",
    accessKeyId: "test",
    secretAccessKey: "test",
  }));
});

test("S3StorageProvider does not require an endpoint", () => {
  assert.doesNotThrow(() => new S3StorageProvider({
    bucket: "test",
    region: "eu-central-1",
    accessKeyId: "test",
    secretAccessKey: "test",
  }));
});

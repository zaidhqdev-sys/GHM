import test from "node:test";
import assert from "node:assert/strict";
import { StorageProviderError } from "./provider.js";

test("StorageProviderError preserves canonical provider code and retryability", () => {
  const error = new StorageProviderError("PROVIDER_UNAVAILABLE", "temporary outage", true);
  assert.equal(error.name, "StorageProviderError");
  assert.equal(error.code, "PROVIDER_UNAVAILABLE");
  assert.equal(error.retryable, true);
  assert.equal(error.message, "temporary outage");
});

test("StorageProviderError defaults retryability to false", () => {
  const error = new StorageProviderError("INVALID_OBJECT", "bad object");
  assert.equal(error.retryable, false);
});

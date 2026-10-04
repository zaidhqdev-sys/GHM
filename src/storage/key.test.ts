import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessLogoProviderKey, STORAGE_PROVIDER_KEY_PREFIX } from "./key.js";

test("business logo keys use the canonical media/logos namespace", () => {
  assert.equal(
    createBusinessLogoProviderKey("42", "550e8400-e29b-41d4-a716-446655440000"),
    `${STORAGE_PROVIDER_KEY_PREFIX}/42/550e8400-e29b-41d4-a716-446655440000`,
  );
});

test("business logo keys reject unsafe business identifiers", () => {
  assert.throws(() => createBusinessLogoProviderKey("../42", "550e8400-e29b-41d4-a716-446655440000"), /invalid storage business id/);
});

test("business logo keys reject non-opaque object identifiers", () => {
  assert.throws(() => createBusinessLogoProviderKey("42", "logo.png"), /invalid storage object id/);
});

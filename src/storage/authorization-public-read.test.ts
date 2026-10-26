import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { createPostgresStorageAuthorization } from "./authorization-adapter.js";
import type { AuthContext } from "../auth/authorization.js";
import type { StorageMetadataRecord } from "./service.js";

const context: AuthContext = { userId: 7, role: "business" };
const publicRecord: StorageMetadataRecord = {
  id: "9001",
  businessId: "201",
  resourceType: "business",
  resourceId: "201",
  objectClass: "business_logo",
  providerKey: "media/logos/201/object",
  contentType: "image/png",
  byteSize: 100,
  visibility: "public",
  status: "available",
};

test("active business public logo can be read without tenant membership", async () => {
  let tenantLookup = false;
  const auth = createPostgresStorageAuthorization(context, {
    withTenantTransaction: async () => { tenantLookup = true; throw new Error("tenant lookup should not be needed"); },
    withAuthorizedTransaction: async (_context, work) => work({
      query: async () => ({ rowCount: 1, rows: [{ "?column?": 1 }] }),
    } as unknown as PoolClient, context),
  });
  await auth.assertCanRead({ userId: "7", businessId: "999" }, publicRecord);
  assert.equal(tenantLookup, false);
});

test("inactive business public logo does not bypass tenant authorization", async () => {
  let tenantLookup = false;
  const auth = createPostgresStorageAuthorization(context, {
    withTenantTransaction: async () => { tenantLookup = true; throw new Error("Business tenant access denied"); },
    withAuthorizedTransaction: async (_context, work) => work({
      query: async () => ({ rowCount: 0, rows: [] }),
    } as unknown as PoolClient, context),
  });
  await assert.rejects(
    auth.assertCanRead({ userId: "7", businessId: "999" }, publicRecord),
    /Business tenant access denied/,
  );
  assert.equal(tenantLookup, true);
});

test("caller identity mismatch is denied before any database transaction", async () => {
  let queried = false;
  const auth = createPostgresStorageAuthorization(context, {
    withTenantTransaction: async () => { queried = true; throw new Error("unexpected query"); },
    withAuthorizedTransaction: async () => { queried = true; throw new Error("unexpected query"); },
  });
  await assert.rejects(
    auth.assertCanRead({ userId: "8", businessId: "201" }, publicRecord),
    /storage access denied/,
  );
  assert.equal(queried, false);
});

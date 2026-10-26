import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { createPostgresStorageAuthorization } from "./authorization-adapter.js";
import type { AuthContext } from "../auth/authorization.js";

const context: AuthContext = { userId: 7, role: "business" };
const managerTenant = { businessId: 201, accountId: 7, membershipId: 11, membershipRole: "owner" } as any;

test("storage management authorization binds requested tenant to authenticated context", async () => {
  const observed: number[] = [];
  const auth = createPostgresStorageAuthorization(context, {
    withTenantTransaction: async (_context, businessId, work) => {
      observed.push(businessId);
      return work({} as PoolClient, context, managerTenant);
    },
    withAuthorizedTransaction: async (_context, work) => work({ query: async () => ({ rowCount: 1, rows: [{}] }) } as unknown as PoolClient, context),
  });
  await auth.assertCanManage(
    { userId: "7", businessId: "201" },
    { type: "business", id: "201", businessId: "201" },
  );
  assert.deepEqual(observed, [201]);
});

test("storage management authorization rejects a caller-supplied different business ID", async () => {
  let queried = false;
  const auth = createPostgresStorageAuthorization(context, {
    withTenantTransaction: async () => { queried = true; throw new Error("should not query"); },
    withAuthorizedTransaction: async () => { throw new Error("unexpected query"); },
  });
  await assert.rejects(
    auth.assertCanManage(
      { userId: "7", businessId: "202" },
      { type: "business", id: "201", businessId: "201" },
    ),
    /storage access denied/,
  );
  assert.equal(queried, false);
});

test("storage management authorization denies non-manager membership", async () => {
  const auth = createPostgresStorageAuthorization(context, {
    withTenantTransaction: async (_context, _businessId, work) =>
      work({} as PoolClient, context, { ...managerTenant, membershipRole: "member" } as any),
    withAuthorizedTransaction: async () => { throw new Error("unexpected query"); },
  });
  await assert.rejects(
    auth.assertCanManage(
      { userId: "7", businessId: "201" },
      { type: "business", id: "201", businessId: "201" },
    ),
    /storage management permission required/,
  );
});

test("storage private read authorization propagates cross-tenant membership denial", async () => {
  const auth = createPostgresStorageAuthorization(context, {
    withTenantTransaction: async () => { throw new Error("Business tenant access denied"); },
    withAuthorizedTransaction: async () => ({ rowCount: 0, rows: [] }) as any,
  });
  await assert.rejects(
    auth.assertCanRead(
      { userId: "7", businessId: "202" },
      {
        id: "9001",
        businessId: "202",
        resourceType: "business",
        resourceId: "202",
        objectClass: "business_logo",
        providerKey: "media/logos/202/object",
        contentType: "image/png",
        byteSize: 100,
        visibility: "private",
        status: "available",
      },
    ),
    /Business tenant access denied/,
  );
});

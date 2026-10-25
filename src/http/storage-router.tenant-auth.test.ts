import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AuthContext } from "../auth/authorization.js";
import type { StorageMetadataRecord, StorageMetadataStore, StorageService } from "../storage/service.js";
import type { StorageProvider } from "../storage/provider.js";
import { registerStorageRoutes } from "./storage-router.js";

const provider = {} as StorageProvider;
const metadataRecord: StorageMetadataRecord = {
  id: "12",
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

async function withServer(work: (baseUrl: string) => Promise<void>, authenticated = true): Promise<void> {
  const app = express();
  app.use(express.json());
  registerStorageRoutes(
    app,
    provider,
    (req, res, next) => {
      if (!authenticated) { res.status(401).json({ error: "unauthorized" }); return; }
      (req as typeof req & { authContext: AuthContext }).authContext = { userId: 7, role: "business" };
      next();
    },
    900,
    3600,
    {
      metadataStoreForContext: () => ({
        createPending: async () => metadataRecord,
        markAvailable: async () => metadataRecord,
        markDeletionPending: async () => ({ ...metadataRecord, status: "deletion_pending" }),
        markDeleted: async () => ({ ...metadataRecord, status: "deleted" }),
        getById: async (id: string) => id === metadataRecord.id ? metadataRecord : null,
      } satisfies StorageMetadataStore),
      serviceForContext: (() => ({
        createUpload: async () => { throw new Error("must not be reached in this test"); },
        completeUpload: async ({ caller }) => {
          if (caller.userId !== "7" || caller.businessId !== "201") throw new Error("storage access denied");
          throw new Error("Business tenant access denied");
        },
        getAccess: async ({ caller }) => {
          if (caller.userId !== "7" || caller.businessId !== "201") throw new Error("storage access denied");
          throw new Error("Business tenant access denied");
        },
        deleteObject: async ({ caller }) => {
          if (caller.userId !== "7" || caller.businessId !== "201") throw new Error("storage access denied");
          throw new Error("Business tenant access denied");
        },
      }) as StorageService),
    },
  );
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  try { await work(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("storage routes reject unauthenticated upload requests before storage access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/storage/business-logos/upload`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId: 1, byteSize: 100, contentType: "image/png" }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  }, false);
});

test("storage routes reject unauthenticated completion requests before storage access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/storage/objects/12/complete`, { method: "POST" });
    assert.equal(response.status, 401);
  }, false);
});

test("storage routes reject unauthenticated access-grant requests before storage access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/storage/objects/12/access`);
    assert.equal(response.status, 401);
  }, false);
});

test("storage routes reject unauthenticated delete requests before storage access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/storage/objects/12`, { method: "DELETE" });
    assert.equal(response.status, 401);
  }, false);
});

for (const [label, path, method] of [
  ["completion", "/api/v1/storage/objects/12/complete", "POST"],
  ["access grant", "/api/v1/storage/objects/12/access", "GET"],
  ["deletion", "/api/v1/storage/objects/12", "DELETE"],
] as const) {
  test(`authenticated cross-tenant ${label} requests are denied`, async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}${path}`, { method });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: "forbidden" });
    });
  });
}

test("authenticated upload for a non-member tenant is denied", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/storage/business-logos/upload`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId: 202, byteSize: 100, contentType: "image/png" }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal_error" });
  });
});

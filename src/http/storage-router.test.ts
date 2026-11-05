import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import { registerStorageRoutes } from "./storage-router.js";
import type { StorageProvider } from "../storage/provider.js";
import type { StorageMetadataRecord, StorageService } from "../storage/service.js";

const baseProvider = {} as StorageProvider;

async function withServer(
  work: (baseUrl: string) => Promise<void>,
  options: {
    provider?: StorageProvider;
    authenticated?: boolean;
    seam?: Parameters<typeof registerStorageRoutes>[5];
  } = {},
): Promise<void> {
  const app = express();
  app.use(express.json());
  const authMiddleware = options.authenticated
    ? (req: express.Request, _res: express.Response, next: express.NextFunction) => {
        (req as express.Request & { authContext?: unknown }).authContext = { userId: 7, role: "business" };
        next();
      }
    : (_req: express.Request, res: express.Response) => { res.status(401).json({ error: "unauthorized" }); };
  registerStorageRoutes(app, options.provider ?? baseProvider, authMiddleware, 900, 3600, options.seam);
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const logoRecord = (overrides: Partial<StorageMetadataRecord> = {}): StorageMetadataRecord => ({
  id: "21",
  businessId: "12",
  resourceType: "business",
  resourceId: "12",
  objectClass: "business_logo",
  providerKey: "media/logos/12/00000000-0000-4000-8000-000000000021",
  contentType: "image/png",
  byteSize: 1200,
  visibility: "public",
  status: "available",
  ...overrides,
});

test("storage routes reject unauthenticated upload requests before storage access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/storage/business-logos/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId: 1, byteSize: 100, contentType: "image/png" }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  });
});

test("storage routes reject unauthenticated completion requests before storage access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/storage/objects/1/complete`, { method: "POST" });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  });
});

test("storage routes reject unauthenticated access-grant requests before storage access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/storage/objects/1/access`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  });
});

test("storage routes reject unauthenticated delete requests before storage access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/storage/objects/1`, { method: "DELETE" });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  });
});

test("Business logo binding rejects an object that belongs to another Business", async () => {
  let bindCalled = false;
  const seam = {
    metadataStoreForContext: () => ({ getById: async () => logoRecord({ businessId: "99", resourceId: "99" }) }) as never,
    bindBusinessLogoForContext: async () => { bindCalled = true; return null; },
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/businesses/12/logo`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: 21 }),
    });
    assert.equal(response.status, 404);
    assert.equal(bindCalled, false);
  }, { authenticated: true, seam });
});

test("Business logo replacement binds the new available object before cleaning the old object", async () => {
  const calls: string[] = [];
  const seam = {
    metadataStoreForContext: () => ({ getById: async () => logoRecord() }) as never,
    bindBusinessLogoForContext: async (_context: unknown, businessId: number, objectId: number | null) => {
      calls.push(`bind:${businessId}:${objectId}`);
      return 18;
    },
    serviceForContext: () => ({
      deleteObject: async ({ objectId }: { objectId: string }) => { calls.push(`delete:${objectId}`); },
    }) as unknown as StorageService,
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/businesses/12/logo`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: 21 }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { businessId: 12, logoObjectId: 21, cleanupPending: false, cleanupObjectId: null });
    assert.deepEqual(calls, ["bind:12:21", "delete:18"]);
  }, { authenticated: true, seam });
});

test("Business logo clear removes the canonical reference before object cleanup", async () => {
  const calls: string[] = [];
  const seam = {
    bindBusinessLogoForContext: async (_context: unknown, businessId: number, objectId: number | null) => {
      calls.push(`bind:${businessId}:${objectId}`);
      return 21;
    },
    serviceForContext: () => ({
      deleteObject: async ({ objectId }: { objectId: string }) => { calls.push(`delete:${objectId}`); },
    }) as unknown as StorageService,
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/businesses/12/logo`, { method: "DELETE" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { businessId: 12, logoObjectId: null, cleanupPending: false, cleanupObjectId: null });
    assert.deepEqual(calls, ["bind:12:null", "delete:21"]);
  }, { authenticated: true, seam });
});

test("Business logo cleanup failure leaves the new canonical reference and reports retry work", async () => {
  const seam = {
    metadataStoreForContext: () => ({ getById: async () => logoRecord() }) as never,
    bindBusinessLogoForContext: async () => 18,
    serviceForContext: () => ({
      deleteObject: async () => { throw new Error("provider unavailable"); },
    }) as unknown as StorageService,
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/businesses/12/logo`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectId: 21 }),
    });
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { businessId: 12, logoObjectId: 21, cleanupPending: true, cleanupObjectId: 18 });
  }, { authenticated: true, seam });
});

test("public Business logo route redirects only to the provider grant for a public eligible logo", async () => {
  let requestedKey = "";
  const provider = {
    createDownloadGrant: async ({ key }: { key: string }) => {
      requestedKey = key;
      return { url: "https://cdn.example/logo?signature=temporary", expiresAt: new Date("2026-11-06T00:00:00Z") };
    },
  } as unknown as StorageProvider;
  const seam = { publicLogoKeyForBusiness: async (businessId: number) => businessId === 12 ? "media/logos/12/object" : null };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses/12/logo`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://cdn.example/logo?signature=temporary");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(requestedKey, "media/logos/12/object");
  }, { provider, seam });
});

test("public Business logo route returns 404 when no approved public logo is available", async () => {
  const provider = { createDownloadGrant: async () => { throw new Error("must not be called"); } } as unknown as StorageProvider;
  const seam = { publicLogoKeyForBusiness: async () => null };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses/12/logo`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  }, { provider, seam });
});

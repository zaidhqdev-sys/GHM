import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import { registerStorageRoutes } from "./storage-router.js";
import type { StorageProvider } from "../storage/provider.js";
import { createStorageService } from "../storage/service.js";
import type { StorageMetadataRecord, StorageService } from "../storage/service.js";
import type { BusinessLogoGatewayClient } from "./business-logo-gateway-client.js";

const baseProvider = {} as StorageProvider;

async function withServer(
  work: (baseUrl: string) => Promise<void>,
  options: {
    provider?: StorageProvider;
    authenticated?: boolean;
    seam?: Parameters<typeof registerStorageRoutes>[5];
    gatewayClient?: BusinessLogoGatewayClient;
    gatewayRequired?: boolean;
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
  registerStorageRoutes(app, options.provider ?? baseProvider, authMiddleware, 900, 3600, options.seam, options.gatewayClient, options.gatewayRequired);
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


test("Business logo upload, validation, binding, public access, replacement and clear work as one storage lifecycle", async () => {
  let nextId = 1;
  let boundObjectId: number | null = null;
  const records = new Map<string, StorageMetadataRecord>();
  const objects = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const makePng = () => {
    const bytes = new Uint8Array(100);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 800, false);
    view.setUint32(20, 600, false);
    bytes.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0], 88);
    return bytes;
  };
  const metadata = {
    createPending: async (input: Omit<StorageMetadataRecord, "id" | "status">) => {
      const record: StorageMetadataRecord = { ...input, id: String(nextId++), status: "pending" };
      records.set(record.id, record);
      calls.push(`pending:${record.id}`);
      return record;
    },
    markAvailable: async (id: string, checksum?: string | null) => {
      const record = records.get(id)!;
      const updated = { ...record, status: "available" as const, checksum: checksum ?? null };
      records.set(id, updated); calls.push(`available:${id}`); return updated;
    },
    markDeletionPending: async (id: string) => {
      const updated = { ...records.get(id)!, status: "deletion_pending" as const };
      records.set(id, updated); calls.push(`deletion-pending:${id}`); return updated;
    },
    markDeleted: async (id: string) => {
      const updated = { ...records.get(id)!, status: "deleted" as const };
      records.set(id, updated); calls.push(`deleted:${id}`); return updated;
    },
    getById: async (id: string) => {
      const record = records.get(id);
      return record?.status === "deleted" ? null : record ?? null;
    },
  };
  const provider = {
    putObject: async ({ key, body }: { key: string; body: Uint8Array | ReadableStream }) => {
      objects.set(key, body as Uint8Array); calls.push(`put:${key}`);
    },
    getObject: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("object not found"); calls.push(`get-object:${key}`); return bytes; },
    headObject: async (key: string) => { const bytes = objects.get(key); if (!bytes) throw new Error("object not found"); calls.push(`head:${key}`); return { key, contentType: "image/png", byteSize: bytes.length, checksum: "test-checksum" }; },
    deleteObject: async (key: string) => { objects.delete(key); calls.push(`delete:${key}`); },
    createUploadGrant: async ({ key, contentType }: { key: string; contentType: string }) => ({ url: "https://upload.example/signed", expiresAt: new Date("2026-11-06T02:00:00Z"), headers: { "content-type": contentType, "x-test-key": key } }),
    createDownloadGrant: async ({ key }: { key: string }) => ({ url: `https://download.example/${encodeURIComponent(key)}?sig=test`, expiresAt: new Date("2026-11-06T02:00:00Z") }),
  } as unknown as StorageProvider;
  const storage = createStorageService({
    provider,
    metadata: metadata as never,
    authorization: {
      assertCanManage: async () => undefined,
      assertCanRead: async () => undefined,
      assertCanDelete: async () => undefined,
    },
  });
  const seam = {
    metadataStoreForContext: () => metadata as never,
    serviceForContext: () => storage,
    bindBusinessLogoForContext: async (_context: unknown, businessId: number, objectId: number | null) => {
      assert.equal(businessId, 12);
      const previous = boundObjectId;
      boundObjectId = objectId;
      calls.push(`bind:${objectId}`);
      return previous;
    },
    publicLogoKeyForBusiness: async (businessId: number) => {
      if (businessId !== 12 || boundObjectId === null) return null;
      const record = records.get(String(boundObjectId));
      return record?.status === "available" ? record.providerKey : null;
    },
  };

  await withServer(async (baseUrl) => {
    const upload = async () => {
      const response = await fetch(`${baseUrl}/api/v1/storage/business-logos/upload`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId: 12, byteSize: 100, contentType: "image/png" }),
      });
      assert.equal(response.status, 201);
      const payload = await response.json() as { objectId: string };
      const record = records.get(payload.objectId)!;
      await provider.putObject({ key: record.providerKey, body: makePng(), contentType: "image/png" });
      const complete = await fetch(`${baseUrl}/api/v1/storage/objects/${payload.objectId}/complete`, { method: "POST" });
      assert.equal(complete.status, 200);
      return Number(payload.objectId);
    };

    const first = await upload();
    const firstBind = await fetch(`${baseUrl}/api/v1/businesses/12/logo`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: first }),
    });
    assert.equal(firstBind.status, 200);
    const firstPublic = await fetch(`${baseUrl}/api/v1/public/businesses/12/logo`, { redirect: "manual" });
    assert.equal(firstPublic.status, 302);
    assert.match(firstPublic.headers.get("location") || "", /download\.example/);

    const second = await upload();
    const replacement = await fetch(`${baseUrl}/api/v1/businesses/12/logo`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectId: second }),
    });
    assert.equal(replacement.status, 200);
    assert.equal(records.get(String(first))?.status, "deleted");
    assert.equal(records.get(String(second))?.status, "available");

    const cleared = await fetch(`${baseUrl}/api/v1/businesses/12/logo`, { method: "DELETE" });
    assert.equal(cleared.status, 200);
    assert.equal(records.get(String(second))?.status, "deleted");
    const noLogo = await fetch(`${baseUrl}/api/v1/public/businesses/12/logo`);
    assert.equal(noLogo.status, 404);
    assert.ok(calls.includes(`bind:${first}`));
    assert.ok(calls.includes(`bind:${second}`));
    assert.ok(calls.includes("bind:null"));
  }, { authenticated: true, provider, seam });
});


test("Business logo binding forwards the verified bearer token through the gateway client", async () => {
  let received: { token: string; businessId: number; objectId: number | null } | undefined;
  const gatewayClient: BusinessLogoGatewayClient = {
    bind: async (token, businessId, objectId) => {
      received = { token, businessId, objectId };
      return 18;
    },
  };
  const seam = {
    metadataStoreForContext: () => ({ getById: async () => logoRecord() }) as never,
    serviceForContext: () => ({ deleteObject: async () => undefined }) as never,
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/businesses/12/logo`, {
      method: "PUT",
      headers: { authorization: "Bearer verified-access-token", "content-type": "application/json" },
      body: JSON.stringify({ objectId: 21 }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { token: "verified-access-token", businessId: 12, objectId: 21 });
    assert.deepEqual(await response.json(), { businessId: 12, logoObjectId: 21, cleanupPending: false, cleanupObjectId: null });
  }, { authenticated: true, seam, gatewayClient, gatewayRequired: true });
});

test("Business logo binding fails closed when the gateway is required but unavailable", async () => {
  const seam = {
    metadataStoreForContext: () => ({ getById: async () => logoRecord() }) as never,
  };
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/businesses/12/logo`, {
      method: "PUT",
      headers: { authorization: "Bearer verified-access-token", "content-type": "application/json" },
      body: JSON.stringify({ objectId: 21 }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "service_unavailable" });
  }, { authenticated: true, seam, gatewayRequired: true });
});

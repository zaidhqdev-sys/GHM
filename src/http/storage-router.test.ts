import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "node:http";
import { registerStorageRoutes } from "./storage-router.js";
import type { StorageProvider } from "../storage/provider.js";

const provider = {} as StorageProvider;

async function withServer(work: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use(express.json());
  registerStorageRoutes(app, provider, (_req, res) => { res.status(401).json({ error: "unauthorized" }); });
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

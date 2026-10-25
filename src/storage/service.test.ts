import test from "node:test";
import assert from "node:assert/strict";
import { createStorageService } from "./service.js";

function deps() {
  const calls: string[] = [];
  const record: any = {
    id: "object-1",
    businessId: "1",
    resourceType: "business",
    resourceId: "1",
    objectClass: "business_logo" as const,
    providerKey: "media/logos/1/550e8400-e29b-41d4-a716-446655440000",
    contentType: "image/png",
    byteSize: 100,
    visibility: "public" as const,
    status: "pending" as const,
    checksum: null,
  };
  return {
    calls,
    record,
    provider: {
      async putObject() {},
      async headObject() {
        calls.push("head");
        return { key: record.providerKey, contentType: "image/png", byteSize: 100 };
      },
      async deleteObject() { calls.push("delete"); },
      async createUploadGrant() {
        calls.push("upload-grant");
        return { url: "https://upload.invalid", expiresAt: new Date(Date.now() + 900000), headers: {} };
      },
      async createDownloadGrant() {
        calls.push("download-grant");
        return { url: "https://download.invalid", expiresAt: new Date(Date.now() + 900000) };
      },
    },
    metadata: {
      async createPending() { calls.push("create-pending"); return record; },
      async markAvailable() { calls.push("available"); return { ...record, status: "available" as const }; },
      async markDeletionPending() { calls.push("deletion-pending"); return { ...record, status: "deletion_pending" as const }; },
      async markDeleted() { calls.push("deleted"); return { ...record, status: "deleted" as const }; },
      async getById() { calls.push("get"); return record as typeof record; },
    },
    authorization: {
      async assertCanManage() { calls.push("manage"); },
      async assertCanRead() { calls.push("read"); },
      async assertCanDelete() { calls.push("delete-auth"); },
    },
  };
}

test("storage service rejects unsupported content type before any side effect", async () => {
  const d = deps();
  const service = createStorageService(d);
  await assert.rejects(service.createUpload({
    caller: { userId: "u1", businessId: "1" },
    resource: { type: "business", id: "1", businessId: "1" },
    objectClass: "business_logo",
    contentType: "application/pdf",
    byteSize: 10,
  }), /unsupported storage content type/);
  assert.deepEqual(d.calls, []);
});

test("storage service rejects oversized objects before authorization or persistence", async () => {
  const d = deps();
  const service = createStorageService(d);
  await assert.rejects(service.createUpload({
    caller: { userId: "u1", businessId: "1" },
    resource: { type: "business", id: "1", businessId: "1" },
    objectClass: "business_logo",
    contentType: "image/png",
    byteSize: 2 * 1024 * 1024 + 1,
  }), /storage object exceeds policy/);
  assert.deepEqual(d.calls, []);
});

test("storage service creates pending metadata before issuing upload grant", async () => {
  const d = deps();
  const service = createStorageService(d);
  const result = await service.createUpload({
    caller: { userId: "u1", businessId: "1" },
    resource: { type: "business", id: "1", businessId: "1" },
    objectClass: "business_logo",
    contentType: "image/png",
    byteSize: 100,
  });
  assert.equal(result.objectId, "object-1");
  assert.deepEqual(d.calls, ["manage", "create-pending", "upload-grant"]);
});

test("storage service verifies provider state before making an object available", async () => {
  const d = deps();
  const service = createStorageService(d);
  const result = await service.completeUpload({ caller: { userId: "u1", businessId: "1" }, objectId: "object-1" });
  assert.equal(result.status, "available");
  assert.deepEqual(d.calls, ["get", "manage", "head", "available"]);
});

test("storage service rejects provider metadata mismatch", async () => {
  const d = deps();
  d.provider.headObject = async () => ({
    key: d.record.providerKey,
    contentType: "image/png",
    byteSize: 101,
  });
  const service = createStorageService(d);
  await assert.rejects(
    service.completeUpload({ caller: { userId: "u1", businessId: "1" }, objectId: "object-1" }),
    /storage provider metadata mismatch/,
  );
  assert.deepEqual(d.calls, ["get", "manage"]);
});

test("storage service only grants access to available objects", async () => {
  const d = deps();
  d.metadata.getById = async () => { d.calls.push("get"); return { ...d.record, status: "pending" }; };
  const service = createStorageService(d);
  await assert.rejects(
    service.getAccess({ caller: { userId: "u1", businessId: "1" }, objectId: "object-1", expiresInSeconds: 300 }),
    /storage object not available/,
  );
  assert.deepEqual(d.calls, ["get"]);
});

test("storage service returns provider-neutral download grants", async () => {
  const d = deps();
  d.metadata.getById = async () => { d.calls.push("get"); return { ...d.record, status: "available" }; };
  const service = createStorageService(d);
  const result = await service.getAccess({ caller: { userId: "u1", businessId: "1" }, objectId: "object-1", expiresInSeconds: 300 });
  assert.equal(result.url, "https://download.invalid");
  assert.equal("providerKey" in result, false);
  assert.deepEqual(d.calls, ["get", "read", "download-grant"]);
});


test("storage service enforces a lower configured download grant maximum", async () => {
  const d = deps();
  d.metadata.getById = async () => { d.calls.push("get"); return { ...d.record, status: "available" }; };
  const service = createStorageService({ ...d, downloadGrantMaxTtlSeconds: 120 });
  await assert.rejects(
    service.getAccess({ caller: { userId: "u1", businessId: "1" }, objectId: "object-1", expiresInSeconds: 121 }),
    /invalid storage grant expiry/,
  );
  assert.deepEqual(d.calls, []);
  const grant = await service.getAccess({
    caller: { userId: "u1", businessId: "1" },
    objectId: "object-1",
    expiresInSeconds: 120,
  });
  assert.equal(grant.url, "https://download.invalid");
});

test("storage service rejects unsafe access-grant expiry before persistence/provider access", async () => {
  const d = deps();
  const service = createStorageService(d);
  await assert.rejects(
    service.getAccess({ caller: { userId: "u1", businessId: "1" }, objectId: "object-1", expiresInSeconds: 0 }),
    /invalid storage grant expiry/,
  );
  assert.deepEqual(d.calls, []);
});


test("storage service stops upload before persistence when tenant authorization denies access", async () => {
  const d = deps();
  d.authorization.assertCanManage = async () => { d.calls.push("manage-denied"); throw new Error("storage access denied"); };
  const service = createStorageService(d);
  await assert.rejects(service.createUpload({
    caller: { userId: "u2", businessId: "2" },
    resource: { type: "business", id: "2", businessId: "2" },
    objectClass: "business_logo",
    contentType: "image/png",
    byteSize: 100,
  }), /storage access denied/);
  assert.deepEqual(d.calls, ["manage-denied"]);
});

test("storage service stops upload completion before provider access when tenant authorization denies access", async () => {
  const d = deps();
  d.authorization.assertCanManage = async () => { d.calls.push("manage-denied"); throw new Error("storage access denied"); };
  const service = createStorageService(d);
  await assert.rejects(
    service.completeUpload({ caller: { userId: "u2", businessId: "2" }, objectId: "object-1" }),
    /storage access denied/,
  );
  assert.deepEqual(d.calls, ["get", "manage-denied"]);
});

test("storage service stops private access grant before signing when tenant authorization denies access", async () => {
  const d = deps();
  d.record.visibility = "private";
  d.metadata.getById = async () => { d.calls.push("get"); return { ...d.record, status: "available" }; };
  d.authorization.assertCanRead = async () => { d.calls.push("read-denied"); throw new Error("storage access denied"); };
  const service = createStorageService(d);
  await assert.rejects(
    service.getAccess({ caller: { userId: "u2", businessId: "2" }, objectId: "object-1", expiresInSeconds: 300 }),
    /storage access denied/,
  );
  assert.deepEqual(d.calls, ["get", "read-denied"]);
});

test("storage service stops deletion before state transition when tenant authorization denies access", async () => {
  const d = deps();
  d.metadata.getById = async () => { d.calls.push("get"); return { ...d.record, status: "available" }; };
  d.authorization.assertCanDelete = async () => { d.calls.push("delete-denied"); throw new Error("storage access denied"); };
  const service = createStorageService(d);
  await assert.rejects(
    service.deleteObject({ caller: { userId: "u2", businessId: "2" }, objectId: "object-1" }),
    /storage access denied/,
  );
  assert.deepEqual(d.calls, ["get", "delete-denied"]);
});

test("storage service leaves deletion pending when provider deletion fails", async () => {
  const d = deps();
  d.provider.deleteObject = async () => { d.calls.push("delete"); throw new Error("provider unavailable"); };
  d.metadata.getById = async () => { d.calls.push("get"); return { ...d.record, status: "available" }; };
  const service = createStorageService(d);
  await assert.rejects(
    service.deleteObject({ caller: { userId: "u1", businessId: "1" }, objectId: "object-1" }),
    /provider unavailable/,
  );
  assert.deepEqual(d.calls, ["get", "delete-auth", "deletion-pending", "delete"]);
});

test("storage service completes deletion only after provider deletion", async () => {
  const d = deps();
  d.metadata.getById = async () => { d.calls.push("get"); return { ...d.record, status: "available" }; };
  const service = createStorageService(d);
  await service.deleteObject({ caller: { userId: "u1", businessId: "1" }, objectId: "object-1" });
  assert.deepEqual(d.calls, ["get", "delete-auth", "deletion-pending", "delete", "deleted"]);
});

test("storage service retries provider deletion for an object already deletion_pending", async () => {
  const d = deps();
  d.metadata.getById = async () => { d.calls.push("get"); return { ...d.record, status: "deletion_pending" }; };
  const service = createStorageService(d);
  await service.deleteObject({ caller: { userId: "u1", businessId: "1" }, objectId: "object-1" });
  assert.deepEqual(d.calls, ["get", "delete-auth", "delete", "deleted"]);
});

test("storage service permits retry after provider deletion failed with deletion_pending state", async () => {
  const d = deps();
  d.metadata.getById = async () => { d.calls.push("get"); return { ...d.record, status: "deletion_pending" }; };
  d.provider.deleteObject = async () => { d.calls.push("delete"); throw new Error("provider unavailable"); };
  const service = createStorageService(d);
  await assert.rejects(
    service.deleteObject({ caller: { userId: "u1", businessId: "1" }, objectId: "object-1" }),
    /provider unavailable/,
  );
  assert.deepEqual(d.calls, ["get", "delete-auth", "delete"]);
});

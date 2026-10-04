import test from "node:test";
import assert from "node:assert/strict";
import { createStorageService } from "./service.js";

test("storage service enforces business logo policy before provider access", async () => {
  let providerCalled = false;
  const service = createStorageService({
    provider: {
      async putObject() {},
      async headObject() { throw new Error("not expected"); },
      async deleteObject() {},
      async createUploadGrant() { providerCalled = true; throw new Error("not expected"); },
      async createDownloadGrant() { throw new Error("not expected"); },
    },
    metadata: {
      async createPending() { throw new Error("not expected"); },
      async markAvailable() { throw new Error("not expected"); },
      async markDeletionPending() { throw new Error("not expected"); },
      async markDeleted() { throw new Error("not expected"); },
      async getById() { return null; },
    },
    authorization: {
      async assertCanManage() { throw new Error("not expected"); },
      async assertCanRead() {},
      async assertCanDelete() {},
    },
    createProviderKey: () => "objects/not-used",
  });

  await assert.rejects(
    service.createUpload({
      caller: { userId: "u1", businessId: "b1" },
      resource: { type: "business", id: "b1", businessId: "b1" },
      objectClass: "business_logo",
      contentType: "application/pdf",
      byteSize: 10,
    }),
    /unsupported storage content type/,
  );
  assert.equal(providerCalled, false);
});

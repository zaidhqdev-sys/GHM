import test from "node:test";
import assert from "node:assert/strict";
import { PostgresStorageMetadataStore } from "./repository.js";

test("storage metadata repository uses canonical persistence functions", async () => {
  const calls: string[] = [];
  const client = {
    async query(text: string) {
      calls.push(text);
      return { rowCount: 1, rows: [{ row: {
        id: "7", tenant_business_id: "42", resource_type: "business",
        resource_id: "42", object_class: "business_logo",
        provider_key: "media/logos/42/550e8400-e29b-41d4-a716-446655440000",
        content_type: "image/png", byte_size: "100",
        visibility: "public", status: "pending"
      }}] };
    },
  };
  const repo = new PostgresStorageMetadataStore(client);
  const row = await repo.createPending({
    businessId: "42", resourceType: "business", resourceId: "42",
    objectClass: "business_logo",
    providerKey: "media/logos/42/550e8400-e29b-41d4-a716-446655440000",
    contentType: "image/png", byteSize: 100, visibility: "public",
  });
  assert.equal(row.id, "7");
  assert.match(calls[0], /ghm\.storage_create_pending/);
});

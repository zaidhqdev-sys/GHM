import test from "node:test";
import assert from "node:assert/strict";
import { TransactionalPostgresStorageMetadataStore } from "./repository.js";

test("storage metadata repository uses canonical persistence functions", async () => {
  const calls: string[] = [];
  const client = {
    async query(text: string) {
      calls.push(text);
      return { rowCount: 1, rows: [{
        id: "7", tenant_business_id: "42", resource_type: "business",
        resource_id: "42", object_class: "business_logo",
        provider_key: "media/logos/42/550e8400-e29b-41d4-a716-446655440000",
        content_type: "image/png", byte_size: "100",
        visibility: "public", status: "pending"
      }] };
    },
  };
  const repo = new TransactionalPostgresStorageMetadataStore({ userId: 1, role: "business" }, async (work) => work(client as any));
  const row = await repo.createPending({
    businessId: "42", resourceType: "business", resourceId: "42",
    objectClass: "business_logo",
    providerKey: "media/logos/42/550e8400-e29b-41d4-a716-446655440000",
    contentType: "image/png", byteSize: 100, visibility: "public",
  });
  assert.equal(row.id, "7");
  assert.match(calls[0], /ghm\.storage_create_pending/);
});

test("storage metadata repository passes authenticated account to scoped getter", async () => {
  let observedQuery = "";
  let observedParams: unknown[] = [];
  const client = {
    async query(text: string, params: unknown[]) {
      observedQuery = text;
      observedParams = params;
      return { rowCount: 1, rows: [{ id: "7", tenant_business_id: "42", resource_type: "business", resource_id: "42", object_class: "business_logo", provider_key: "media/logos/42/object", content_type: "image/png", byte_size: "100", visibility: "public", status: "available" }] };
    },
  };
  const repo = new TransactionalPostgresStorageMetadataStore({ userId: 71, role: "business" }, async (work) => work(client as any));
  const row = await repo.getById("7");
  assert.equal(row?.id, "7");
  assert.ok(observedQuery.includes("ghm.storage_get_object($1, $2)"));
  assert.deepEqual(observedParams, [7, 71]);
});

test("storage metadata repository recognizes canonical missing-object error", async () => {
  const client = {
    async query(text: string, params: unknown[]) {
      assert.ok(text.includes("ghm.storage_get_object($1, $2)"));
      assert.deepEqual(params, [999, 1]);
      throw new Error("storage object does not exist");
    },
  };
  const repo = new TransactionalPostgresStorageMetadataStore({ userId: 1, role: "business" }, async (work) => work(client as any));
  assert.equal(await repo.getById("999"), null);
});


test("storage metadata repository expands lifecycle composite return values into table columns", async () => {
  const queries: string[] = [];
  const client = {
    async query(text: string) {
      queries.push(text);
      return { rowCount: 1, rows: [{
        id: "8", tenant_business_id: "42", resource_type: "business",
        resource_id: "42", object_class: "business_logo",
        provider_key: "media/logos/42/550e8400-e29b-41d4-a716-446655440000",
        content_type: "image/png", byte_size: "100",
        visibility: "public", status: "available"
      }] };
    },
  };
  const repo = new TransactionalPostgresStorageMetadataStore({ userId: 1, role: "business" }, async (work) => work(client as any));
  const created = await repo.createPending({
    businessId: "42", resourceType: "business", resourceId: "42",
    objectClass: "business_logo", providerKey: "media/logos/42/550e8400-e29b-41d4-a716-446655440000",
    contentType: "image/png", byteSize: 100, visibility: "public",
  });
  assert.equal(created.id, "8");
  assert.equal(created.businessId, "42");
  assert.equal(created.status, "available");
  assert.match(queries[0], /SELECT \* FROM ghm\.storage_create_pending\(/);
});

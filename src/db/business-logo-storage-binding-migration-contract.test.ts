import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("database/migrations/20261106090000_business_logo_storage_binding.sql", "utf8");
const storageRouter = fs.readFileSync("src/http/storage-router.ts", "utf8");
const identityRepository = fs.readFileSync("src/resources/business-identity/repository.ts", "utf8");
const publicRepository = fs.readFileSync("src/resources/business-identity/public-repository.ts", "utf8");

test("Business logo reference is stored on the canonical GHM Business row", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS logo_storage_object_id bigint/);
  assert.match(migration, /REFERENCES ghm\.storage_object\(id\) ON DELETE SET NULL/);
  assert.match(migration, /business_logo_storage_object_unique/);
  assert.match(identityRepository, /logo_storage_object_id/);
  assert.match(identityRepository, /logoUrl: row\.logo_storage_object_id/);
});

test("logo binding is owner/administrator and tenant scoped in the database", () => {
  assert.match(migration, /FUNCTION ghm\.set_business_logo_object/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, ghm/);
  assert.match(migration, /membership_status = 'active'/);
  assert.match(migration, /membership_role IN \('owner', 'administrator'\)/);
  assert.match(migration, /so\.tenant_business_id = p_business_id/);
  assert.match(migration, /so\.resource_id = p_business_id/);
  assert.match(migration, /so\.object_class = 'business_logo'/);
  assert.match(migration, /so\.status = 'available'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.set_business_logo_object\(bigint, bigint, bigint\) TO ghm_runtime/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.set_business_logo_object\(bigint, bigint, bigint\) FROM PUBLIC/);
});

test("public logo lookup only returns active, verified and approved Business logos", () => {
  assert.match(migration, /FUNCTION ghm\.storage_get_public_business_logo/);
  assert.match(migration, /b\.is_active = true/);
  assert.match(migration, /b\.is_verified = true/);
  assert.match(migration, /b\.verification_status = 'approved'/);
  assert.match(migration, /so\.visibility = 'public'/);
  assert.match(migration, /so\.status = 'available'/);
  assert.match(publicRepository, /logo_storage_object_id/);
  assert.match(publicRepository, /logoUrl: row\.logo_storage_object_id/);
});

test("HTTP binding verifies completed object ownership and cleans replaced objects after rebinding", () => {
  assert.match(storageRouter, /record\.businessId !== String\(businessId\)/);
  assert.match(storageRouter, /record\.objectClass !== "business_logo"/);
  assert.match(storageRouter, /record\.status !== "available"/);
  assert.match(storageRouter, /const previousObjectId = await bindLogo/);
  assert.match(storageRouter, /await serviceFor\(context, accessToken\)\.deleteObject/);
  assert.match(storageRouter, /cleanupPending/);
  assert.match(storageRouter, /cleanupObjectId: cleanupPending \? previousObjectId : null/);
});

test("public logo HTTP access redirects through a short-lived provider grant", () => {
  assert.match(storageRouter, /\/api\/v1\/public\/businesses\/:businessId\/logo/);
  assert.match(storageRouter, /createDownloadGrant/);
  assert.match(storageRouter, /Math\.min\(300, downloadGrantMaxTtlSeconds\)/);
  assert.match(storageRouter, /res\.redirect\(302, grant\.url\)/);
});


test("storage completion inspects image bytes and enforces signature and pixel limits", () => {
  const storageService = fs.readFileSync("src/storage/service.ts", "utf8");
  const providerContract = fs.readFileSync("src/storage/provider.ts", "utf8");
  const s3Provider = fs.readFileSync("src/storage/s3-provider.ts", "utf8");
  const imageValidator = fs.readFileSync("src/storage/business-logo-image.ts", "utf8");
  assert.match(providerContract, /getObject\(key: string\): Promise<Uint8Array>/);
  assert.match(s3Provider, /async getObject\(key: string\)/);
  assert.match(storageService, /validateBusinessLogoBytes\(bytes, record\.contentType\)/);
  assert.match(imageValidator, /image\/jpeg/);
  assert.match(imageValidator, /image\/png/);
  assert.match(imageValidator, /image\/webp/);
  assert.match(imageValidator, /MAX_BYTES = 2 \* 1024 \* 1024/);
  assert.match(imageValidator, /MAX_EDGE = 2048/);
});

test("logo binding migration leaves transaction boundaries to the migration runner", () => {
  const migrationRunner = fs.readFileSync("src/db/migrate.ts", "utf8");
  assert.match(migrationRunner, /await client\.query\('BEGIN'\)/);
  assert.match(migrationRunner, /await client\.query\('COMMIT'\)/);
  assert.doesNotMatch(migration, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
});

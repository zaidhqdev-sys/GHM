import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "database/migrations/20261107211500_reconcile_business_profile_and_founder_authority.sql",
  "utf8",
);

test("production reconciliation is repeatable for partially present Business columns", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS latitude double precision/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS longitude double precision/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS logo_storage_object_id bigint/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS business_logo_storage_object_unique/);
  assert.match(migration, /pg_constraint/);
  assert.match(migration, /business_coordinates_pair_check/);
});

test("founder authority remains private, explicit, and unseeded", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ghm\.directory_listing_founder_reviewer/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE ghm\.directory_listing_founder_reviewer FROM PUBLIC, ghm_runtime/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION ghm\.is_directory_listing_founder_reviewer/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = pg_catalog, ghm/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.is_directory_listing_founder_reviewer\(bigint\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.is_directory_listing_founder_reviewer\(bigint\) TO ghm_runtime/);
  assert.doesNotMatch(migration, /INSERT INTO ghm\.directory_listing_founder_reviewer/);
});

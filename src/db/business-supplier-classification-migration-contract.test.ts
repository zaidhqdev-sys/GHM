import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261110010000_add_business_supplier_classification.sql'), 'utf8');
const gatewayMigration = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261110260000_gateway_supplier_classification_cutover.sql'), 'utf8');
const repository = fs.readFileSync(path.resolve(process.cwd(), 'src/resources/business-identity/repository.ts'), 'utf8');
const identityContracts = fs.readFileSync(path.resolve(process.cwd(), 'src/resources/business-identity/contracts.ts'), 'utf8');
const publicRepository = fs.readFileSync(path.resolve(process.cwd(), 'src/resources/business-identity/public-repository.ts'), 'utf8');
const directoryRepository = fs.readFileSync(path.resolve(process.cwd(), 'src/resources/directory/repository.ts'), 'utf8');
const directoryContracts = fs.readFileSync(path.resolve(process.cwd(), 'src/resources/directory/contracts.ts'), 'utf8');
const http = fs.readFileSync(path.resolve(process.cwd(), 'src/http/app.ts'), 'utf8');

test('supplier classification is a canonical GHM Business field with a deterministic default', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS is_supplier boolean NOT NULL DEFAULT false/);
  assert.match(migration, /UPDATE ghm\.business\s+SET is_supplier = false\s+WHERE is_supplier IS NULL/);
  assert.match(migration, /ALTER COLUMN is_supplier SET NOT NULL/);
  assert.match(repository, /is_supplier/);
  assert.match(identityContracts, /isSupplier\?: boolean/);
});

test('supplier classification writes require active owner or administrator membership in a SECURITY DEFINER function', () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /membership_status = 'active'/);
  assert.match(migration, /membership_role IN \('owner', 'administrator'\)/);
  assert.match(migration, /SET search_path = pg_catalog, ghm/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.update_business_supplier_classification\(bigint, bigint, boolean\) FROM PUBLIC/);
  assert.match(gatewayMigration, /REVOKE ALL ON FUNCTION ghm\.update_business_supplier_classification\(bigint, bigint, boolean\) FROM ghm_runtime/);
  assert.match(gatewayMigration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_update_business_supplier_classification\(bigint, bigint, boolean\) TO ghm_actor_gateway/);
  assert.match(gatewayMigration, /REVOKE ALL ON FUNCTION ghm\.gateway_update_business_supplier_classification\(bigint, bigint, boolean\) FROM ghm_runtime/);
  assert.doesNotMatch(repository, /ghm\.update_business_supplier_classification/);
  assert.match(repository, /must be updated through the authenticated actor gateway/);
  assert.match(http, /supplierClassificationGatewayClient\.update/);
});

test('public profile and directory expose only the canonical supplier boolean', () => {
  assert.match(publicRepository, /is_supplier/);
  assert.match(publicRepository, /isSupplier: row\.is_supplier === true/);
  assert.match(directoryRepository, /b\.is_supplier/);
  assert.match(directoryRepository, /query\.businessType/);
  assert.match(directoryContracts, /'suppliers' \| 'contractors'/);
});

test('supplier classification is not represented as verified capability or Trust evidence', () => {
  assert.match(migration, /Not a verified capability or Trust signal/);
  assert.doesNotMatch(migration, /insurance_verified\s*=|jobs_completed\s*=/);
});

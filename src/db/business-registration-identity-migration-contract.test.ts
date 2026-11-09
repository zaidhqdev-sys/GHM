import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migrationPath = path.resolve(
  process.cwd(),
  'database/migrations/20261108150000_reconcile_business_registration_identity_authorization.sql',
);
const migration = fs.readFileSync(migrationPath, 'utf8');
const contracts = fs.readFileSync(path.resolve(process.cwd(), 'src/resources/business-identity/contracts.ts'), 'utf8');
const publicContracts = fs.readFileSync(path.resolve(process.cwd(), 'src/resources/business-identity/public-contracts.ts'), 'utf8');

test('registration identity is stored separately and constrained as a self-declared private projection', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ghm\.business_registration_identity/);
  assert.match(migration, /Existing business_registration_identity table has an incompatible column shape/);
  assert.match(migration, /Existing business_registration_identity table is missing expected validated constraints/);
  assert.match(migration, /incompatible primary key/);
  assert.match(migration, /incompatible Business foreign key/);
  assert.match(migration, /incompatible account foreign key/);
  assert.match(migration, /incompatible column types, nullability, or defaults/);
  assert.match(migration, /pg_get_constraintdef/);
  assert.match(migration, /business_registration_identity_declaration_shape_check/);
  assert.match(migration, /registration_status IS NULL OR registration_status IN \('registered', 'unregistered'\)/);
  assert.match(migration, /length\(btrim\(registration_number\)\) BETWEEN 1 AND 120/);
  assert.match(migration, /length\(btrim\(legal_name\)\) BETWEEN 1 AND 200/);
  assert.match(migration, /ALTER TABLE ghm\.business_registration_identity ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE ghm\.business_registration_identity FROM ghm_runtime/);
  assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL) ON TABLE ghm\.business_registration_identity TO ghm_runtime/i);
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = pg_catalog, ghm/);
  assert.match(migration, /bm\.membership_role IN \('owner', 'administrator'\)/);
  assert.equal((migration.match(/b\.is_active = true/g) ?? []).length, 2);
  assert.match(migration, /updated_by_account_id/);
});

test('general and public Business DTOs do not expose private registration identity fields', () => {
  assert.doesNotMatch(contracts, /registrationNumber|registrationStatus|legalName/);
  assert.doesNotMatch(publicContracts, /registrationNumber|registrationStatus|legalName/);
});
